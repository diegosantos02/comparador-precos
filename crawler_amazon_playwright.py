import os
import re
import urllib.parse
import psycopg2
from playwright.sync_api import sync_playwright

TERMOS_BUSCA = [
    {"termo": "ESP32 DevKit V1", "categoria": "ESP32 & Maker"},
    {"termo": "Arduino Uno R3", "categoria": "Arduino & Maker"},
    {"termo": "Sensor DHT22", "categoria": "Sensores & Maker"},
    {"termo": "Processador Ryzen 5", "categoria": "Processadores"},
    {"termo": "Mouse Gamer", "categoria": "Mouses"},
    {"termo": "Teclado Mecanico", "categoria": "Teclados"},
]

def obter_conexao():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL não configurada.")
    return psycopg2.connect(db_url)

def extrair_preco(texto):
    if not texto:
        return None
    limpo = re.sub(r"[^\d,\.]", "", texto).strip()
    if "," in limpo and "." in limpo:
        limpo = limpo.replace(".", "").replace(",", ".")
    elif "," in limpo:
        limpo = limpo.replace(",", ".")
    try:
        val = float(limpo)
        return val if val > 0 else None
    except ValueError:
        return None

def salvar_produto(conn, nome, categoria, imagem_url, url_produto, preco):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO produtos (nome, categoria, imagem_url)
            VALUES (%s, %s, %s)
            ON CONFLICT (nome) DO UPDATE 
            SET imagem_url = EXCLUDED.imagem_url, categoria = EXCLUDED.categoria
            RETURNING id;
            """,
            (nome, categoria, imagem_url),
        )
        produto_id = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO produtos_links (produto_id, loja, url_produto, ativo, ultima_verificacao)
            VALUES (%s, 'Amazon', %s, TRUE, CURRENT_TIMESTAMP)
            ON CONFLICT (url_produto) DO UPDATE 
            SET ativo = TRUE, ultima_verificacao = CURRENT_TIMESTAMP
            RETURNING id;
            """,
            (produto_id, url_produto),
        )
        link_id = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO historico_precos (produto_link_id, preco, capturado_em)
            VALUES (%s, %s, CURRENT_TIMESTAMP);
            """,
            (link_id, preco),
        )
    conn.commit()

def coletar_amazon():
    print("Iniciando conexão com o NeonDB...")
    conn = obter_conexao()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        # Otimização: Bloquear fontes e imagens pesadas durante a navegação
        page.route("**/*.{png,jpg,jpeg,svg,webp,gif,woff,woff2}", lambda route: route.abort())

        try:
            for item in TERMOS_BUSCA:
                termo = item["termo"]
                categoria = item["categoria"]
                print(f"\n--- Coletando categoria [{categoria}]: {termo} ---")
                
                url = f"https://www.amazon.com.br/s?k={urllib.parse.quote(termo)}"
                page.goto(url, wait_until="domcontentloaded", timeout=30000)

                cards = page.locator("div[data-component-type='s-search-result']").all()
                print(f"Cards encontrados: {len(cards)}")

                coletados = 0
                for card in cards:
                    if coletados >= 4:
                        break
                    try:
                        asin = card.get_attribute("data-asin")
                        if not asin:
                            continue

                        titulo_elem = card.locator("h2 span, h2 a span").first
                        if not titulo_elem.count():
                            continue
                        titulo = titulo_elem.inner_text().strip()

                        preco_elem = card.locator(".a-price .a-offscreen").first
                        if not preco_elem.count():
                            continue
                        preco = extrair_preco(preco_elem.text_content())
                        if not preco:
                            continue

                        # Coleta o atributo da imagem antes do bloqueio de download
                        img_elem = card.locator("img.s-image").first
                        img_url = img_elem.get_attribute("src") if img_elem.count() else ""
                        url_produto = f"https://www.amazon.com.br/dp/{asin}"

                        salvar_produto(conn, titulo, categoria, img_url, url_produto, preco)
                        print(f"✓ Salvo via Playwright: {titulo[:45]}... | R$ {preco:.2f}")
                        coletados += 1
                    except Exception:
                        continue

        finally:
            browser.close()
            conn.close()
            print("\nColeta finalizada com sucesso.")

if __name__ == "__main__":
    coletar_amazon()
