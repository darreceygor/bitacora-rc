# Bitácora de Radioaficionado

Plugin para Obsidian que permite llevar una bitácora de contactos (QSOs) y generar tarjetas QSL automáticamente.

## Funcionalidades

- **Formulario rápido** en panel lateral para registrar QSOs
- **Tabla completa** de todos los QSOs realizados con filtros visuales
- **Generación automática de tarjetas QSL** al guardar (configurable)
- **Elección de fondo**: aleatorio o imagen personalizada desde la vault
- **Pegado directo de QSL recibidas** (Ctrl+V en nota QSO → se guarda en `QSLs Recibidas/`)
- **Exportación a ADIF** estándar
- **Normalización automática** de licencias y nombres

## Instalación

### Desde la comunidad (recomendado)
1. `Configuración → Plugins comunitarios → Explorar`
2. Buscar "Bitácora de radioaficionado"
3. Instalar y activar

### Manual
1. Copiar la carpeta `bitacora_rc` a `.obsidian/plugins/`
2. Recargar Obsidian (`Ctrl+R`)
3. Activar en `Configuración → Plugins comunitarios`

## Uso

### Primeros pasos
1. Abrir el panel lateral (icono de radio 📻)
2. Configurar tu licencia y datos en **Ajustes del plugin**
3. Empezar a registrar QSOs con el formulario

### Estructura de carpetas creada automáticamente
```
BITACORA DE RADIO/
├── QSOs/                 # Notas de cada contacto (QSO_YYYYMMDD_HHMM_BAND_CALL.md)
├── QSLs Recibidas/       # Imágenes pegadas desde el corresponsal
├── QSLs Enviadas/        # Tarjetas QSL generadas (QSL_*.jpg)
└── Img/                  # Fondos para tarjetas QSL (poné tus imágenes aquí)
```

### Generar tarjeta QSL
**Automática** (al guardar): Se activa en Ajustes → "Generar QSL automáticamente al guardar".  
**Manual**: Comando `Generar tarjeta QSL del QSO activo` o botón 🖼️ al pie de cada nota QSO.

Ambos abren un modal para elegir:
- 🎲 **Fondo aleatorio**: elige al azar de `BITACORA DE RADIO/Img/`
- 🖼️ **Elegir fondo específico**: lista tus imágenes + opción "Subir imagen del equipo…"

## Ajustes del plugin

| Ajuste | Descripción |
|--------|-------------|
| Licencia | Tu distintiva (ej. LU9EFF). Usada en título, ADIF y formulario |
| Nombre de operador | Tu nombre. Se exporta como `my_name` en ADIF |
| ITU Zone | Zona ITU de tu estación (ej. 13) |
| CQ Zone | Zona CQ de tu estación (ej. 13) |
| GRID Locator | Tu locador Maidenhead (ej. GF05) |
| **Generar QSL automáticamente al guardar** | **Nuevo**: crea la tarjeta QSL en `QSLs Enviadas/` cada vez que guardás un QSO. Abre modal para elegir tipo de fondo. |

## Especificaciones de imagen para fondos QSL

La tarjeta se genera en un **canvas del tamaño exacto de la imagen de fondo**. El texto del QSO se dibuja en una banda inferior semitransparente (16% del alto), y el logo (`escudo.jpg`) en la esquina superior derecha (17.6% del alto).

### Formatos admitidos
JPG, PNG, WebP, GIF, BMP, SVG, AVIF

### Zonas reservadas (evitar contenido importante)

```
┌─────────────────────────────────────┐
│ ███████████████████████████████████ │ ← Borde ~19px (0.5cm @ 96dpi)
│ █  ┌──────────────────────────┐  █ │
│ █  │     SAFE ZONE (65%×70%)  │  █ │  ← Centro: zona visible garantizada
│ █  │    (contenido principal) │  █ │
│ █  └──────────────────────────┘  █ │
│ █  ┌──────────────────────────┐  █ │  ← Logo: esquina sup. der.
│ █  │       LOGO 17.6% alto    │  █ │     (escudo.jpg del plugin)
│ █  └──────────────────────────┘  █ │
│ ███████████████████████████████████ │
│ ███████████████████████████████████ │ ← Banda inferior 16% alto
│ █  Texto QSO (call, banda, modo,  █ │     Fondo semitransparente negro 55%
│ █  RST, comentario) centrado      █ │
│ ███████████████████████████████████ │
└─────────────────────────────────────┘
```

### Tamaños recomendados (relación ~1.55:1 ≈ estándar QSL 140×90mm)

| Uso | DPI | Píxeles (ancho × alto) | Peso aprox. |
|-----|-----|------------------------|-------------|
| **Impresión** | 300 | 1654 × 1063 | 300–500 KB |
| **Pantalla / balance** | 150 | 827 × 531 | 100–200 KB |
| **Mínimo usable** | 96 | 529 × 340 | 50–100 KB |

> **Nota**: Cualquier tamaño funciona (el canvas se adapta), pero resoluciones bajas pixelan el texto. Evitá imágenes muy panorámicas (>2:1) o muy cuadradas (<1.2:1).

### Imagen por defecto
Si no hay imágenes en `BITACORA DE RADIO/Img/`, se usa el fondo incluido en el plugin (`qsl_background.jpg` embebido).

## Comandos

| Comando | Acción |
|---------|--------|
| `Exportar QSOs a ADIF` | Genera `.adi` con todos los QSOs de la bitácora |
| `Ver tabla de QSOs realizados` | Abre vista de tabla completa |
| `Generar tarjeta QSL del QSO activo` | Genera QSL para la nota abierta (requiere nota `QSO_*`) |

## Importación ADIF

Botón **📥 Importar ADIF** en el panel lateral. Seleccioná un archivo `.adi` o `.adif` y se crearán las notas QSO correspondientes en `BITACORA DE RADIO/QSOs/`.

- **Duplicados**: se omiten (mismo call, fecha, hora **y banda**)
- **Campos soportados**: `call`, `qso_date`, `time_on`, `band`, `mode`, `station_callsign`, `operator`, `my_name`, `my_itu_zone`, `my_cq_zone`, `my_gridsquare`, `name`, `rst_sent`, `rst_rcvd`, `prop_mode`, `comment`
- **Valores por defecto**: usa tus ajustes (licencia, operador, ITU/CQ zone, grid) si faltan en el ADIF

## Formato de nota QSO (frontmatter)

```yaml
---
emisor: LU9EFF
corresponsal: LU1ABC
nombre: Juan Pérez
fecha: 2026-01-15
hora_utc: 14:32
banda: 20m
modo: SSB
propagacion: ---
rst: 59
operador: Darío
itu_zone: 13
cq_zone: 13
grid: GF05
url: "[[QSLs Recibidas/QSL_20260115_1432_LU1ABC.jpg]]"
comentario: Gracias por el contacto! 73!
---
```

## Exportación ADIF

Campos incluidos: `call`, `qso_date`, `time_on`, `band`, `mode`, `station_callsign`, `operator`, `my_name`, `my_itu_zone`, `my_cq_zone`, `my_gridsquare`, `name`, `rst_sent`, `rst_rcvd`, `prop_mode` (si SAT), `comment`.

## Licencia

MIT © 2026 LU9EFF
