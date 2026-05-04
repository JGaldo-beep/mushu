# API de cupones Mushu (`MUSHU_REDEEM_URL`)

La app envía un `POST` HTTPS a la URL configurada en la variable de entorno **`MUSHU_REDEEM_URL`** (incluye path completo, p. ej. `https://cupones.tu-dominio.workers.dev/redeem`).

## Request

```http
POST /redeem
Content-Type: application/json
```

```json
{ "code": "1023-XABE" }
```

- `code`: string no vacío; la app valida longitud máxima 64 y caracteres `[A-Za-z0-9_-]`.

## Response exitosa (2xx)

```json
{ "groq_api_key": "gsk_..." }
```

La app guarda `groq_api_key` igual que si el usuario la pegara en Ajustes (`secrets.json` + keyring en Windows).

## Response error (4xx / 5xx)

Cuerpo JSON opcional:

```json
{ "message": "Cupón inválido o ya usado" }
```

Si no hay `message`, la app muestra un mensaje genérico con el código HTTP.

## Ejemplo Cloudflare Worker (conceptual)

1. Crear un **KV namespace** (o D1) con mapa `cupon_codigo` → `gsk_...` o estado “usado”.
2. En el Worker: validar método POST, parsear JSON, comprobar cupón, marcar **un solo uso**, **rate limit** por IP (p. ej. `cf-connecting-ip`).
3. Devolver la key solo si el cupón es válido y no usado; no loguear la key completa.
4. En `wrangler.toml` o secrets del Worker: nunca commitear keys reales al repo del Worker.

```javascript
// Pseudocódigo — no es código desplegable tal cual
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const { code } = await request.json();
    const key = await env.COUPONS.get(code);
    if (!key) return Response.json({ message: "Cupón inválido" }, { status: 404 });
    await env.COUPONS.delete(code); // o marca "used" en otro registro
    return Response.json({ groq_api_key: key });
  },
};
```

## Seguridad

- La URL del redeem es pública en el cliente; la protección real está en el servidor (cupones de un uso, rate limit, rotación).
- No embebas API keys de Groq en el binario de Mushu; solo en tu backend.
