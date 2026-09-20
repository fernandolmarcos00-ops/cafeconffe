# Cardápio Digital

## Configuração
1. Crie o projeto no Supabase.
2. No SQL Editor execute `supabase.sql` inteiro.
3. Em Authentication > Users crie o usuário administrador.
4. Copie o UUID desse usuário e execute: `insert into public.admin_users(user_id) values('SEU_UUID');`
5. Em Project Settings > API copie a Project URL e a chave pública.
6. Cole em `assets/js/config.js`.
7. Teste o `index.html` e `admin.html` em um servidor local.
8. Publique a pasta no Netlify.

## Importante
Use somente a chave pública no navegador. Nunca coloque a `service_role` key no código.

## URLs depois de publicar
Cardápio: `/`
Administração: `/admin.html`

O painel permite criar/editar/excluir categorias e produtos, alterar preços, descrições, disponibilidade e imagens, além das informações do negócio. O cardápio público não precisa acessar o painel nem o banco diretamente pelo usuário.
