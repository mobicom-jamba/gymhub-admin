# Sono static-egress relay (Fly.io)

Sono / rico.mn merchant-уудаас дуудлага хийх IP-г whitelist хийхийг шаарддаг.
Vercel serverless function-ууд динамик egress IP ашигладаг тул тогтмол IP өгөх
боломжгүй. Энэ relay нь Fly.io дээр **тогтмол (dedicated) IPv4**-тэй жижиг Caddy
reverse-proxy ажиллуулж, бүх Sono дуудлагыг rico.mn руу дамжуулна. Sono тэр нэг
IP-г л харна.

```
Vercel (gymhub-admin)  ──HTTPS──>  gymhub-sono-relay.fly.dev  ──HTTPS──>  rico.mn
   SONO_BASE_URL = https://gymhub-sono-relay.fly.dev        (тогтмол IPv4)
```

Энэ нь **зөвхөн Sono-д** хамаатай. QPay / Pocket / Carepay / MonPay өөрсдийн
base URL-аар Vercel-ээс шууд явсаар байна — энд огт өөрчлөгдөхгүй.

## Зардал
- Dedicated IPv4: ~$2/сар
- shared-cpu-1x / 256MB машин 24/7: ~$2/сар
- **Нийт ≈ $4/сар.** (`auto_stop_machines = "stop"` болговол машины зардлыг
  хасч ~$2/сар болгож болно — гэхдээ анхны төлбөр дээр cold start хэдэн секунд
  саатах магадлалтай.)

## Deploy

### 1. Fly CLI суулгах, нэвтрэх
```bash
curl -L https://fly.io/install.sh | sh
fly auth login        # эсвэл: fly auth signup
```

### 2. App үүсгэх
```bash
cd services/sono-relay
fly apps create gymhub-sono-relay   # fly.toml-ийн app нэртэй таарч байх ёстой
```

### 3. Тогтмол (dedicated) IPv4 авах  ← Sono-д өгөх IP энэ
```bash
fly ips allocate-v4 --app gymhub-sono-relay     # ~$2/сар, dedicated
```
> `--shared` ашиглаж болохгүй — shared IP тогтмол биш бөгөөд egress-д баталгаагүй.

### 4. Deploy
```bash
fly deploy --app gymhub-sono-relay
```

### 5. Egress (гарах) IP-г баталгаажуулах
Sono-д өгөх ёстой IP бол rico.mn-ийн харах **гарах** IP. Машин дотроос шалга:
```bash
fly ssh console --app gymhub-sono-relay -C "wget -qO- https://api.ipify.org"
```
Энэ нь 3-р алхамд авсан dedicated IPv4-тэй тань таарах ёстой. **Тэр IP-г Sono-д
whitelist хийлгэхээр илгээ.**

### 6. Vercel env солих
Vercel → `gymhub-admin` → Settings → Environment Variables:
```
SONO_BASE_URL = https://gymhub-sono-relay.fly.dev
```
Дараа нь `gymhub-admin`-ийг redeploy хий. (App код өөрчлөх шаардлагагүй —
`sono/route.ts`, `sono/check/route.ts` хоёул аль хэдийн `SONO_BASE_URL` уншдаг.)

### 7. Тест
- Sono-гоор төлбөрийн нэхэмжлэл үүсгэх → QR/амжилттай хариу ирэх ёстой.
- Алдаа гарвал лог: `fly logs --app gymhub-sono-relay`.

## Заавал биш: shared-secret хамгаалалт
Relay-ийн URL-ийг мэдсэн хэн ч rico.mn руу дамжуулж болзошгүй (гэхдээ Sono-ийн
`x-and-auth-*` түлхүүргүй бол rico.mn татгалзана). Илүү чанга болгох бол:

1. `Caddyfile` дотор `reverse_proxy`-ийн өмнө secret шалгалт нэм:
   ```caddyfile
   :80 {
   	@no_secret not header x-relay-secret {$RELAY_SECRET}
   	respond @no_secret "forbidden" 403

   	reverse_proxy https://rico.mn {
   		header_up Host rico.mn
   	}
   }
   ```
   (`{$RELAY_SECRET}` нь Caddyfile-ийн орчин хувьсагч — build/боот үед орлуулагдана.)
2. `fly.toml` дотор `[env] RELAY_SECRET = "..."`-г идэвхжүүлж дахин deploy хий.
3. Vercel дээр ижил `RELAY_SECRET` нэм.
4. `src/lib/proxy-fetch.ts` дотор `x-relay-secret` header нэмж илгээ:
   ```ts
   export function proxyFetch(url: string, init: RequestInit = {}): Promise<Response> {
     const secret = process.env.RELAY_SECRET;
     const headers = new Headers(init.headers);
     if (secret) headers.set("x-relay-secret", secret);
     return fetch(url, { ...init, headers });
   }
   ```

## Анхаарах
- Relay унавал Sono төлбөр зогсоно — тиймээс `min_machines_running = 1`-ээр
  байнга асаалттай байлгаж байна. Хүсвэл 2 регион/машинаар нэмж найдвартай болго.
- Dedicated IPv4-аа битгий устга — устгавал шинэ IP гарч, Sono-д дахин
  whitelist хийлгэх шаардлагатай болно.
