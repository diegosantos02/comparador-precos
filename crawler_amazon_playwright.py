import os
import re
import time
import random
import urllib.parse
import psycopg2
from playwright.sync_api import sync_playwright

STRING_NEON_PADRAO = (
    "postgresql://neondb_owner:npg_pCst8BP9Vrmy@"
    "ep-dry-frost-ac58yt76-pooler.sa-east-1.aws.neon.tech/neondb"
    "?sslmode=require&channel_binding=require"
)

# Meta de produtos válidos por categoria (ajuste entre 100 e 200)
META_POR_CATEGORIA = 150
MAX_PAGINAS_POR_TERMO = 4

CATEGORIAS_BUSCA = [
    {
        "categoria": "ESP32 & Maker",
        "termos": ["ESP32 DevKit V1", "ESP32 S3", "ESP32 CAM", "NodeMCU ESP8266"],
    },
    {
        "categoria": "Arduino & Maker",
        "termos": ["Arduino Uno R3", "Arduino Nano", "Arduino Mega 2560", "Kit Arduino"],
    },
    {
        "categoria": "Sensores & Maker",
        "termos": ["Sensor DHT22", "Sensor Ultrassonico HC-SR04", "Modulo Rele Arduino", "Display OLED I2C"],
    },
    {
        "categoria": "Processadores",
        "termos": ["Processador AMD Ryzen", "Processador Intel Core", "Processador Ryzen 5", "Processador Ryzen 7"],
    },
    {
        "categoria": "Mouses",
        "termos": ["Mouse Gamer", "Mouse Sem Fio Logitech", "Mouse Gamer Redragon", "Mouse Gamer RGB"],
    },
    {
        "categoria": "Teclados",
        "termos": ["Teclado Mecanico", "Teclado Gamer RGB", "Teclado Mecanico Redragon", "Teclado Mecanico 60%"],
    },
]

PALAVRAS_BLOQUEADAS = [
    "alimento", "alimentos", "triturador", "cozinha", "legumes",
    "alho", "cebola", "lâmina", "lâminas", "lamina", "picador",
    "moedor", "manual", "multiprocessador", "mixer", "liquidificador",
    "pasta térmica", "pasta termica", "adesivo", "livro", "apostila",
]

TERMOS_CPU_OBRIGATORIOS = [
    "ryzen", "intel", "core i3", "core i5", "core i7", "core i9",
    "xeon", "athlon", "threadripper", "am4", "am5", "lga",
]

EXCLUSOES_CPU = [
    "cooler", "water cooler", "placa mãe", "placa-mãe", "placa mae",
    "notebook", "pc gamer", "computador completo",
]


def obter_conexao():
    db_url = os.getenv("DATABASE_URL", STRING_NEON_PADRAO)
    return psycopg2.connect(db_url)


def extrair_preco(texto):
    if not texto:
        return None
    limpo = re.sub(r"[^\d,\.]", "", texto).strip()
    if "," in limpo and "." in limpo:
        if limpo.rfind(",") > limpo.rfind("."):
            limpo = limpo.replace(".", "").replace(",", ".")
        else:
            limpo = limpo.replace(",", "")
    elif "," in limpo:
        limpo = limpo.replace(",", ".")
    try:
        val = float(limpo)
        return val if val > 0 else None
    except ValueError:
        return None


def produto_valido(titulo: str, categoria: str, preco: float) -> bool:
    nome_lower = titulo.lower()

    if any(palavra in nome_lower for palavra in PALAVRAS_BLOQUEADAS):
        return False

    if categoria == "Processadores":
        if preco < 150.0:
            return False
        if any(exc in nome_lower for exc in EXCLUSOES_CPU):
            return False
        if not any(termo in nome_lower for termo in TERMOS_CPU_OBRIGATORIOS):
            return False

    return True


def salvar_produto(conn, nome, categoria, imagem_url, url_produto, preco):
    with conn.cursor() as cur:
        # 1. Verifica se o link da Amazon já existe em produtos_links
        cur.execute(
            "SELECT id, produto_id FROM produtos_links WHERE url_produto = %s LIMIT 1;",
            (url_produto,),
        )
        link_existente = cur.fetchone()

        if link_existente:
            link_id, produto_id = link_existente
            cur.execute(
                """
                UPDATE produtos
                SET nome = %s,
                    categoria = %s,
                    imagem_url = COALESCE(NULLIF(%s, ''), imagem_url)
                WHERE id = %s;
                """,
                (nome, categoria, imagem_url, produto_id),
            )
            cur.execute(
                """
                UPDATE produtos_links
                SET ativo = TRUE, ultima_verificacao = CURRENT_TIMESTAMP
                WHERE id = %s;
                """,
                (link_id,),
            )
        else:
            # 2. Verifica se já existe produto com mesmo nome; senão insere
            cur.execute("SELECT id FROM produtos WHERE nome = %s LIMIT 1;", (nome,))
            prod_existente = cur.fetchone()

            if prod_existente:
                produto_id = prod_existente[0]
            else:
                cur.execute(
                    """
                    INSERT INTO produtos (nome, categoria, imagem_url)
                    VALUES (%s, %s, %s)
                    RETURNING id;
                    """,
                    (nome, categoria, imagem_url),
                )
                produto_id = cur.fetchone()[0]

            # 3. Insere o link da Amazon vinculado ao produto
            cur.execute(
                """
                INSERT INTO produtos_links (produto_id, loja, url_produto, ativo, ultima_verificacao)
                VALUES (%s, 'Amazon', %s, TRUE, CURRENT_TIMESTAMP)
                RETURNING id;
                """,
                (produto_id, url_produto),
            )
            link_id = cur.fetchone()[0]

        # 4. Grava o preço atual no histórico
        cur.execute(
            """
            INSERT INTO historico_precos (produto_link_id, preco, coletado_em)
            VALUES (%s, %s, CURRENT_TIMESTAMP);
            """,
            (link_id, preco),
        )
    conn.commit()


def coletar_amazon():
    print("Conectando ao banco NeonDB...")
    conn = obter_conexao()
    print("✓ Conexão com o banco estabelecida.")

    total_geral = 0
    asins_vistos_global = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
            locale="pt-BR",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page = context.new_page()

        # Bloqueia mídia pesada para acelerar mantendo o atributo src das imagens
        page.route("**/*.{png,jpg,jpeg,svg,webp,gif,woff,woff2}", lambda route: route.abort())

        try:
            for grupo in CATEGORIAS_BUSCA:
                categoria = grupo["categoria"]
                termos = grupo["termos"]
                coletados = 0

                print(f"\n==========================================")
                print(f"Categoria [{categoria}] (Meta: {META_POR_CATEGORIA})")
                print(f"==========================================")

                for termo in termos:
                    if coletados >= META_POR_CATEGORIA:
                        break

                    print(f"\n-> Termo de busca: '{termo}'")

                    for pagina in range(1, MAX_PAGINAS_POR_TERMO + 1):
                        if coletados >= META_POR_CATEGORIA:
                            break

                        url = f"https://www.amazon.com.br/s?k={urllib.parse.quote(termo)}&page={pagina}"
                        print(f"   Página {pagina}...")

                        try:
                            page.goto(url, wait_until="domcontentloaded", timeout=35000)
                            page.wait_for_timeout(random.randint(1500, 2800))
                        except Exception as e:
                            print(f"   ⚠️ Falha ao carregar página {pagina}: {e}")
                            break

                        if page.locator("form[action*='validateCaptcha']").count() > 0:
                            print("   ⚠️ CAPTCHA detectado pela Amazon. Pulando para próximo termo.")
                            break

                        cards = page.locator("div[data-component-type='s-search-result']").all()
                        if not cards:
                            break

                        for card in cards:
                            if coletados >= META_POR_CATEGORIA:
                                break
                            try:
                                asin = card.get_attribute("data-asin")
                                if not asin or asin in asins_vistos_global:
                                    continue
                                asins_vistos_global.add(asin)

                                titulo_elem = card.locator("h2").first
                                if not titulo_elem.count():
                                    continue
                                titulo = titulo_elem.inner_text().strip()
                                if not titulo:
                                    continue

                                preco_elem = card.locator(".a-price .a-offscreen").first
                                if not preco_elem.count():
                                    continue
                                preco = extrair_preco(preco_elem.text_content())
                                if not preco:
                                    continue

                                if not produto_valido(titulo, categoria, preco):
                                    continue

                                img_elem = card.locator("img.s-image").first
                                img_url = img_elem.get_attribute("src") if img_elem.count() else ""
                                url_produto = f"https://www.amazon.com.br/dp/{asin}"

                                salvar_produto(conn, titulo, categoria, img_url, url_produto, preco)
                                coletados += 1
                                total_geral += 1
                                print(
                                    f"   [{coletados}/{META_POR_CATEGORIA}] ✓ "
                                    f"{titulo[:42]}... | R$ {preco:.2f}"
                                )
                            except Exception as e:
                                conn.rollback()
                                print(f"   ⚠️ Erro ao processar card: {e}")
                                continue

                        if coletados < META_POR_CATEGORIA and pagina < MAX_PAGINAS_POR_TERMO:
                            time.sleep(random.uniform(2.0, 4.0))

                print(f"\nResumo [{categoria}]: {coletados} produtos gravados.")

        finally:
            browser.close()
            conn.close()
            print(f"\nColeta finalizada! Total geral gravado: {total_geral} produtos.")


if __name__ == "__main__":
    coletar_amazon()
