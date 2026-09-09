import os
import re
import time
import urllib.parse
import psycopg2
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# Categorias e termos de busca focados em hardware/makers
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
        raise ValueError("A variável de ambiente DATABASE_URL não foi definida.")
    return psycopg2.connect(db_url)

def iniciar_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)

def extrair_preco(texto):
    if not texto:
        return None
    # Remove R$, espaços e converte formato 1.234,56 para float 1234.56
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
        # 1. Insere ou busca o produto geral
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

        # 2. Insere ou atualiza o link na tabela produtos_links
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

        # 3. Registra a aferição na tabela de histórico
        cur.execute(
            """
            INSERT INTO historico_precos (produto_link_id, preco, capturado_em)
            VALUES (%s, %s, CURRENT_TIMESTAMP);
            """,
            (link_id, preco),
        )
    conn.commit()

def coletar_amazon():
    print("Iniciando conexão com o banco de dados...")
    conn = obter_conexao()
    driver = iniciar_driver()

    try:
        for item in TERMOS_BUSCA:
            termo = item["termo"]
            categoria = item["categoria"]
            print(f"\n--- Coletando categoria [{categoria}]: {termo} ---")
            
            url_busca = f"https://www.amazon.com.br/s?k={urllib.parse.quote(termo)}"
            driver.get(url_busca)
            time.sleep(3)

            # Rola a página para forçar o carregamento de imagens
            driver.execute_script("window.scrollTo(0, 1000);")
            time.sleep(2)

            cards = driver.find_elements(By.CSS_SELECTOR, "div[data-component-type='s-search-result']")
            print(f"Cards encontrados: {len(cards)}")

            coletados = 0
            for card in cards:
                if coletados >= 4:  # Limite de 4 produtos por categoria por execução
                    break
                try:
                    asin = card.get_attribute("data-asin")
                    if not asin:
                        continue

                    # Título
                    elem_titulo = card.find_elements(By.CSS_SELECTOR, "h2 span, h2 a span")
                    titulo = elem_titulo[0].text.strip() if elem_titulo else ""
                    if not titulo:
                        continue

                    # Preço
                    elem_preco = card.find_elements(By.CSS_SELECTOR, ".a-price .a-offscreen")
                    if not elem_preco:
                        continue
                    preco = extrair_preco(elem_preco[0].get_attribute("textContent"))
                    if not preco:
                        continue

                    # Imagem
                    elem_img = card.find_elements(By.CSS_SELECTOR, "img.s-image")
                    img_url = elem_img[0].get_attribute("src") if elem_img else ""

                    # Link canônico limpo
                    url_produto = f"https://www.amazon.com.br/dp/{asin}"

                    salvar_produto(conn, titulo, categoria, img_url, url_produto, preco)
                    print(f"✓ Salvo: {titulo[:45]}... | R$ {preco:.2f}")
                    coletados += 1
                except Exception as e:
                    continue

    finally:
        driver.quit()
        conn.close()
        print("\nColeta finalizada com sucesso.")

if __name__ == "__main__":
    coletar_amazon()
