# Fatura da Família

Aplicativo web (um único arquivo HTML, sem build, sem dependências de servidor) para dividir a fatura do cartão de crédito entre familiares que usam o mesmo cartão.

## O que faz

- Cadastro dos familiares que usam o cartão.
- Reconhecimento automático de lançamentos ao colar o texto da fatura (PDF copiado, CSV ou extrato).
- Tabela de lançamentos totalmente editável (data, descrição, valor, responsável).
- Resumo por pessoa com total e texto pronto para copiar e enviar (WhatsApp, SMS, etc.).
- Histórico de meses salvos, tudo persistido localmente no navegador (`localStorage`) — nenhum dado sai da sua máquina.

## Como usar

Abra `index.html` diretamente no navegador, ou publique como página estática (ver abaixo).

Não há back-end, API ou coleta de dados: tudo roda no navegador do usuário.

## Rodar localmente

```bash
# qualquer servidor estático serve, por exemplo:
python3 -m http.server 8080
# depois abra http://localhost:8080
```

Ou simplesmente abra o arquivo `index.html` direto no navegador.

## Publicar

Funciona em qualquer hospedagem de site estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages) — basta apontar para `index.html`.

## Limitações conhecidas

- O reconhecimento automático da fatura é feito por padrões de texto (regex) e pode não cobrir todos os formatos de banco/operadora. Os lançamentos são sempre editáveis manualmente.
- Os dados ficam salvos apenas no navegador/dispositivo onde a página foi usada (`localStorage`). Trocar de navegador ou limpar dados do site apaga o histórico.

## Roadmap (ideias futuras)

- [ ] Importação de PDF/CSV como arquivo (em vez de colar texto).
- [ ] Exportar resumo em PDF.
- [ ] Suporte a múltiplos cartões.
- [ ] Sincronização entre dispositivos.

## Licença

MIT — veja [LICENSE](LICENSE).
