# Problemas conocidos del conector de WhatsApp (Baileys)

Mitot usa [Baileys](https://github.com/WhiskeySockets/Baileys) (protocolo no oficial, ingeniería inversa de WhatsApp Web) porque la API oficial de WhatsApp no es viable para este caso de uso. Este documento lista los problemas reales encontrados y su estado.

## Por qué no usamos la API oficial

La **WhatsApp Business Cloud API Groups** (lanzada en 2026) está limitada a **8 participantes por grupo**. El grupo real que usa Mitot tiene ~60+ participantes — descartada de raíz, sin alternativa oficial disponible hoy.

## Conexión / Estabilidad

### 1. Envío saliente se cuelga indefinidamente en grupos grandes — **PAUSADO**
- `Reply` desde el panel a WhatsApp real nunca resuelve.
- Probado con timeouts de 20s y 60s; ambos expiraron sin completar el envío.
- Causa: bug documentado de Baileys — el estado `sender-key-memory` nunca se invalida en grupos grandes/formato LID, causando que el envío espere indefinidamente la sincronización de claves de cifrado.
- Sin solución confiable disponible en la versión actual de la librería.

### 2. El proceso crasheaba sin auto-reinicio — **CORREGIDO**
- Un crash real dejó el listener muerto durante horas sin que nadie lo notara (quedó registrado como `failed` y abandonado).
- Corregido con un supervisor propio (`services/ingest/supervise.mjs`) que reinicia el proceso ante cualquier crash con backoff.
- Es un parche nuestro; Baileys no ofrece esto de fábrica.

### 3. Reconexiones silenciosas — **MITIGADO**
- El socket se cierra por status 408 / timeouts de red sin aviso claro.
- Mitigado con endpoint `/status` real (`state`, `connectedAt`, `lastMessageAt`, `reconnects`) e indicador visual en el panel.

## Pérdida silenciosa de datos

### 4. Caption vacío (`""`) tratado como texto real — **CORREGIDO**
- WhatsApp envía `caption: ""` en vez de omitir el campo.
- La validación lo trataba como "hay texto" en vez de caer al placeholder, y fallaba silenciosamente (`min(1)` en string vacío).
- Corregido: se verifica longitud real antes de aceptar el campo.

### 5. Sin backfill de historial durante caídas — **PENDIENTE**
- `syncFullHistory: false` por diseño (evita resincronizar todo el historial en cada arranque).
- Resultado: cualquier mensaje enviado mientras el proceso está caído se pierde para siempre, sin forma de recuperarlo.
- Baileys expone `fetchMessageHistory` para pedir historial bajo demanda (evento `messaging-history.set`), pero no está implementado — mayor complejidad, comportamiento no 100% documentado.

## Multimedia

### 6. Detección de tipo de contenido sin caption — **CORREGIDO**
- En la primera implementación, imágenes/videos/audios sin pie de foto no se detectaban ni ingresaban al pipeline.

### 7. Descarga de media requiere lógica propia — **RESUELTO, pero manual**
- `downloadMediaMessage` no viene integrado al pipeline; hubo que construir descarga, almacenamiento en disco y servido estático a mano.

## Estructural / Arquitectura

### 8. Protocolo no oficial — **RIESGO PERMANENTE**
- Ingeniería inversa de WhatsApp Web; rompe con cada actualización de WhatsApp sin aviso previo.
- Riesgo real de baneo de cuenta según los Términos de Servicio de Meta.

### 9. API oficial descartada — **SIN ALTERNATIVA**
- Ver "Por qué no usamos la API oficial" arriba. Límite de 8 participantes hace inviable la migración mientras el grupo sea grande.

### 10. Sesión de autenticación como punto único de falla — **MITIGADO**
- Si `.wa-auth` se corrompe, requiere re-escanear el QR desde cero (downtime + posible pérdida de contexto).
- Mitigado con backup automático cada 5 minutos a `.wa-auth.backup`, pero la fragilidad de diseño persiste.

## Resumen

Baileys es la única opción técnica viable para grupos grandes (la API oficial no aplica), pero trae inestabilidad real de conexión — especialmente en **envío saliente a grupos grandes** — que seguimos parchando en capas (supervisor, backups, reintentos, indicadores de salud) en vez de tener una base sólida y oficialmente soportada.
