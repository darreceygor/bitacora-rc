# Bitácora de Radioaficionado (bitacora_rc)

Plugin para Obsidian que permite llevar una bitácora de contactos de radioaficionado (QSOs), generar tarjetas QSL y exportar a formato ADIF.

## Características

- **Formulario de QSO**: Registro rápido de contactos (licencia, nombre, fecha, hora, banda, modo, RST, propagación, comentario)
- **Tarjetas QSL**: Generación automática de tarjetas QSL con fondo personalizable y logo
- **Fondo aleatorio**: Opción de usar fondo aleatorio de las imágenes en `BITACORA DE RADIO/Img/`
- **QSL recibidas**: Pegado directo de imágenes en notas QSO para guardar como QSL recibida
- **Exportación ADIF**: Exporta todos los QSOs a formato ADIF estándar
- **Tabla de QSOs**: Vista completa con todos los contactos registrados
- **Normalización automática**: Corrige licencias y nombres invertidos automáticamente

## Instalación

### Desde el directorio oficial de Obsidian (recomendado)
1. Abrir Configuración → Plugins comunitarios → Examinar
2. Buscar "Bitácora de radioaficionado" o "bitacora_rc"
3. Instalar y activar

### Instalación manual
1. Descargar la última release desde GitHub
2. Descomprimir en `.obsidian/plugins/bitacora_rc/`
3. Recargar Obsidian (`Ctrl+R`) y activar el plugin

## Uso

### Primer uso
1. Al activar, se crea la estructura de carpetas:
   ```
   BITACORA DE RADIO/
   ├── QSOs/              # Notas de contactos
   ├── QSLs Recibidas/    # QSLs pegadas en notas
   ├── QSLs Enviadas/     # Tarjetas QSL generadas
   ├── Img/               # Fondos para tarjetas QSL
   └── Log/               # Logo (escudo.jpg)
   ```

2. Configurar tu licencia en **Ajustes → Bitácora de radioaficionado**

### Registrar un QSO
- Click en el icono de radio (barra lateral) → abrir panel
- Completar formulario → "Guardar QSO"
- Se genera automáticamente la tarjeta QSL en `QSLs Enviadas/`

### Generar tarjeta QSL manual
- En una nota `QSO_*`: `Ctrl+P` → "Generar tarjeta QSL del QSO activo"
- Elegir: **Fondo aleatorio** (de `Img/`) o **Elegir fondo específico**

### QSL recibida
- Abrir nota QSO → pegar imagen (Ctrl+V) → se guarda en `QSLs Recibidas/` y enlaza en la nota

### Ver tabla de QSOs
- `Ctrl+P` → "Ver tabla de QSOs realizados"
- Click en fila para abrir el QSO

### Exportar ADIF
- `Ctrl+P` → "Exportar QSOs a ADIF"
- Descarga archivo `.adi` con todos los contactos

## Ajustes del plugin

| Campo | Descripción |
|-------|-------------|
| **Licencia** | Tu distintiva (ej. LU9EFF). Usada en título, ADIF y formulario |
| **Nombre de operador** | Tu nombre. Se guarda en cada QSO y exporta como `my_name` en ADIF |
| **ITU Zone** | Zona ITU de tu estación (ej. 13) |
| **CQ Zone** | Zona CQ de tu estación (ej. 13) |
| **GRID Locator** | Tu locador Maidenhead (ej. GF05) |

## Estructura de notas QSO

```markdown
---
emisor: LU9EFF
corresponsal: LU1ABC
nombre: Juan Pérez
fecha: 2026-10-07
hora_utc: 14:30
banda: 40m
modo: SSB
propagacion: ---
rst: 59
operador: Tu Nombre
itu_zone: 13
cq_zone: 13
grid: GF05
url: "[[BITACORA DE RADIO/QSLs Recibidas/QSL_20261007_1430_LU1ABC.jpg]]"
comentario: Gracias por el contacto! 73!
---
Gracias por el contacto! 73!
```

## Personalización

### Fondos de tarjeta QSL
- Colocar imágenes JPG/PNG en `BITACORA DE RADIO/Img/`
- El plugin elige una aleatoria al generar QSL (o se puede elegir manual)

### Logo
- Se usa `BITACORA DE RADIO/Log/escudo.jpg` (se crea automáticamente desde asset embebido)

### Imagen de header del panel
- La primera imagen en `BITACORA DE RADIO/Img/` se muestra arriba del título
- Click en la imagen para cambiarla

## Comandos

| Comando | ID | Descripción |
|---------|-----|-------------|
| Exportar QSOs a ADIF | `exportar-adif` | Exporta todos los QSOs a archivo `.adi` |
| Ver tabla de QSOs | `ver-tabla-qso` | Abre vista de tabla con todos los contactos |
| Generar tarjeta QSL | `generar-tarjeta-qsl` | Genera QSL del QSO activo (con opciones) |

## Requisitos

- Obsidian ≥ 1.4.0
- Sin dependencias externas (solo APIs DOM: canvas, Blob, TextEncoder)

## Licencia

MIT © 2026 LU9EFF