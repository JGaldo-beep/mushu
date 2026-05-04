# Mushu

App de escritorio (**Tauri 2** + **React** + **Vite**) para dictado por voz con Whisper local y opciones en la nube vía **Groq**.

## Desarrollo

```bash
npm install
npm run tauri dev
```

## Build (Windows)

```bash
npm run tauri build
```

Salida típica: `src-tauri/target/release/mushu.exe` y bundles en `src-tauri/target/release/bundle/`.

## Cupones Groq (`MUSHU_REDEEM_URL`)

Para que los usuarios puedan **reclamar un cupón** en el onboarding (sin pegar su propia key de inmediato), la app llama por HTTPS a la URL que definas en la variable de entorno **`MUSHU_REDEEM_URL`** (URL completa del endpoint, p. ej. `https://tu-app.vercel.app/api/redeem`).

- El cliente es **Rust** (`reqwest`); no hace falta CORS hacia Vercel.
- Sin `MUSHU_REDEEM_URL`, el botón de reclamar mostrará el error configurado en el backend de Tauri.

Contrato del API (request/response, Worker de ejemplo): [docs/coupon-redeem-api.md](docs/coupon-redeem-api.md).

### Cómo lanzar la app con la URL (ejemplo Windows / PowerShell)

```powershell
$env:MUSHU_REDEEM_URL = "https://tu-dominio.vercel.app/api/redeem"
npm run tauri dev
```

Para un `.exe` ya compilado, define la variable de entorno de usuario o del sistema antes de abrir Mushu, o documenta a tus amigos un acceso directo que la establezca.

## Flujo para amigos

1. **Con cupón:** en el onboarding introducen el código y pulsan **Reclamar**; tu servidor devuelve `{ "groq_api_key": "gsk_..." }` y Mushu la guarda como en Ajustes.
2. **Sin cupón:** enlace a [Groq Console – API keys](https://console.groq.com/keys), crean key y la pegan en **Ajustes**.

## IDE recomendado

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
