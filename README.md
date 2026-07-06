# CAOS After Night - Lista

Site para lista de nomes da festa CAOS, com pagina publica sem login e painel admin para criar eventos, ver nomes, buscar na portaria e exportar CSV.

## Rodar localmente

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

Admin:

```text
http://localhost:3000/#admin
```

Senha inicial:

```text
caos123
```

Troque a senha pelo painel admin depois do primeiro acesso.

## Testes

```bash
npm test
```

## Deploy no Render

1. Crie um repositorio no GitHub.
2. Suba todos os arquivos desta pasta para o repositorio.
3. No Render, clique em `New` > `Web Service`.
4. Conecte o GitHub e selecione o repositorio.
5. Use:

```text
Build Command: npm install
Start Command: npm start
```

6. Configure o disco persistente:

```text
Mount path: /opt/render/project/src/storage
Size: 1 GB
```

7. Configure a variavel de ambiente:

```text
CAOS_DATA_FILE=/opt/render/project/src/storage/data.json
```

O arquivo `render.yaml` ja deixa essas configuracoes prontas para Blueprint no Render.

## Links depois do deploy

Pagina publica:

```text
https://seu-site.onrender.com
```

Painel admin:

```text
https://seu-site.onrender.com/#admin
```

## Observacao importante

O site salva os dados em um arquivo JSON. No Render, use sempre o disco persistente configurado acima para nao perder listas quando o servidor reiniciar.
