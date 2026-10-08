import { App, Editor, FuzzySuggestModal, ItemView, MarkdownFileInfo, MarkdownPostProcessorContext, MarkdownView, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { BG_B64, LOGO_B64 } from './assets';

const VIEW_TYPE_LOGGER = "logger-view";
const VIEW_TYPE_TABLA = "qso-tabla-view";
const ROOT_FOLDER = "BITACORA DE RADIO";
const FOLDER_NAME = `${ROOT_FOLDER}/QSOs`;
const QSL_FOLDER = `${ROOT_FOLDER}/QSLs Recibidas`;
const SENT_FOLDER = `${ROOT_FOLDER}/QSLs Enviadas`;
const IMG_FOLDER = `${ROOT_FOLDER}/Img`;
const LOGO_FOLDER = `${ROOT_FOLDER}/Log`;
const QSO_PREFIX = "QSO_";
const BG_PATH = `${IMG_FOLDER}/qsl_background.jpg`;
const LOGO_PATH = `${LOGO_FOLDER}/escudo.jpg`;

export interface BitacoraSettings {
	licencia: string;
	operador: string;
	ituZone: string;
	cqZone: string;
	grid: string;
	autoGenerarQSL: boolean;
}

const DEFAULT_SETTINGS: BitacoraSettings = {
	licencia: "LU9EFF",
	operador: "",
	ituZone: "",
	cqZone: "",
	grid: "",
	autoGenerarQSL: true,
};

export interface FilaQSO {
	file: TFile;
	licencia: string;
	nombre: string;
	fecha: string;
	hora: string;
	banda: string;
	modo: string;
	propagacion: string;
	rst: string;
	operador: string;
	grid: string;
	comentario: string;
	qslEnviada: boolean;
	qslRecibida: boolean;
}

const IMAGE_MIME_EXT: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/bmp": "bmp",
	"image/svg+xml": "svg",
	"image/avif": "avif",
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "svg"]);

export default class LoggerPlugin extends Plugin {
	settings: BitacoraSettings = DEFAULT_SETTINGS;
	private ribbonIcon: HTMLElement | null = null;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<BitacoraSettings>);

		// Mover carpetas viejas de la raíz a BITACORA DE RADIO
		await this.migrateFolders();

		// Crear carpetas si no existen
		await this.ensureFolder(FOLDER_NAME);
		await this.ensureFolder(QSL_FOLDER);
		await this.ensureFolder(SENT_FOLDER);
		await this.ensureFolder(IMG_FOLDER);

		// Copiar los assets del plugin a la vault si faltan (instalación nueva)
		await this.ensureAssets();

		// Registrar la vista del formulario
		this.registerView(
			VIEW_TYPE_LOGGER,
			(leaf) => new LoggerView(leaf, this.app, this)
		);

		// Registrar la vista con la tabla completa de QSOs
		this.registerView(
			VIEW_TYPE_TABLA,
			(leaf) => new QsoTableView(leaf, this.app, this)
		);

		// Normalizar licencia/nombre de los registros ya guardados
		await this.normalizarRegistros();

		// Agregar ícono en la barra lateral izquierda
		this.ribbonIcon = this.addRibbonIcon('radio', `Abrir ${this.titulo()}`, () => {
			void this.activateView();
		});

		// Ajustes del plugin
		this.addSettingTab(new BitacoraSettingsTab(this.app, this));

		// Comando para exportar a ADIF
		this.addCommand({
			id: 'exportar-adif',
			name: 'Exportar QSOs a ADIF',
			callback: () => this.exportarADIF(),
		});

		// Comando para ver la tabla completa de QSOs
		this.addCommand({
			id: 'ver-tabla-qso',
			name: 'Ver tabla de QSOs realizados',
			callback: () => void this.activateTableView(),
		});

		// Comando para generar la tarjeta QSL del QSO activo
		this.addCommand({
			id: 'generar-tarjeta-qsl',
			name: 'Generar tarjeta QSL del QSO activo',
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !file.basename.startsWith(QSO_PREFIX)) {
					new Notice("Abrí una nota QSO_* para generar la tarjeta");
					return;
				}
				new QSLFondoModal(this.app, this, (usarAleatorio: boolean) => {
					if (usarAleatorio) {
						void this.generarTarjetaQSL(file);
					} else {
						new FondoQSLModal(this.app, this, (fondo) => {
							void this.generarTarjetaQSL(file, undefined, fondo);
						}).open();
					}
				}).open();
			},
		});

		// Pegar imagen en una nota QSO_* => se guarda como QSL_* en QSLs/
		this.registerEvent(
			this.app.workspace.on('editor-paste', (evt, editor, info) => {
				if (evt.defaultPrevented) return;
				void this.onEditorPaste(evt, editor, info);
			})
		);

		// Bloque al pie de cada nota QSO_*: generar QSL + zona de QSL recibida
		this.registerMarkdownPostProcessor((el, ctx) => {
			this.renderPieQSL(el, ctx);
		});
	}

	renderPieQSL(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(file instanceof TFile)) return;
		if (file.extension !== "md" || !file.basename.startsWith(QSO_PREFIX)) return;
		if (file.parent?.path !== FOLDER_NAME) return;

		const bloque = el.createDiv({ cls: "qso-qsl-bloque" });

		const btnGenerar = bloque.createEl("button", {
			text: "🖼️ Generar QSL",
			cls: "qso-qsl-generar",
		});
		btnGenerar.addEventListener("click", () => {
			new FondoQSLModal(this.app, this, (fondo) => {
				void this.generarTarjetaQSL(file, undefined, fondo);
			}).open();
		});

		bloque.createEl("hr", { cls: "qso-qsl-sep" });

		bloque.createEl("div", { text: "QSL Recibida", cls: "qso-qsl-titulo" });
		bloque.createEl("div", {
			text: "Pegar la captura de la QSL recibida por el contacto realizado",
			cls: "qso-qsl-subtitulo",
		});
	}

	subirImagenEquipo(): Promise<string | null> {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "image/*";
			input.addEventListener("change", () => {
				void (async () => {
					const file = input.files?.[0];
					if (!file) {
						resolve(null);
						return;
					}
					try {
						await this.ensureFolder(IMG_FOLDER);
						const ext = this.imageExt(file);
						const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "fondo_qsl";
						const path = await this.uniquePath(`${IMG_FOLDER}/${base}`, ext);
						await this.app.vault.createBinary(path, await file.arrayBuffer());
						resolve(path);
					} catch (e) {
						new Notice("No se pudo cargar la imagen: " + (e instanceof Error ? e.message : String(e)));
						resolve(null);
					}
				})();
			});
			input.click();
		});
	}

	titulo(): string {
		return `Bitácora de ${this.settings.licencia || DEFAULT_SETTINGS.licencia}`;
	}

	licencia(): string {
		return (this.settings.licencia || DEFAULT_SETTINGS.licencia).trim().toUpperCase();
	}

	normalizarLicencia(v: unknown): string {
		return (v ?? "").toString().trim().toUpperCase().replace(/\s+/g, "");
	}

	normalizarNombre(v: unknown): string {
		return (v ?? "").toString().trim().replace(/\s+/g, " ");
	}

	pareceLicencia(v: unknown): boolean {
		const s = this.normalizarLicencia(v);
		if (!/^[A-Z0-9/]{3,14}$/.test(s)) return false;
		return /\d/.test(s);
	}

	licenciaArchivo(v: unknown): string {
		return this.normalizarLicencia(v).replace(/[\\/:*?"<>|]/g, "-");
	}

	corregirLicenciaYNombre(licencia: unknown, nombre: unknown): { licencia: string; nombre: string; corregido: boolean } {
		const crudoLic = (licencia ?? "").toString().trim();
		let lic = this.normalizarLicencia(licencia);
		let nom = this.normalizarNombre(nombre);
		if (lic && !this.pareceLicencia(lic) && this.pareceLicencia(nom)) {
			lic = this.normalizarLicencia(nom);
			nom = this.normalizarNombre(crudoLic);
			return { licencia: lic, nombre: nom, corregido: true };
		}
		return { licencia: lic, nombre: nom, corregido: false };
	}

	async normalizarRegistros() {
		const notas = this.app.vault.getFiles().filter((f) =>
			f.extension === "md" &&
			f.parent?.path === FOLDER_NAME &&
			f.basename.startsWith(QSO_PREFIX)
		);

		const pendientes: { file: TFile; key: string; viejo: string; nuevo: string }[] = [];
		let cambios = 0;

		for (const file of notas) {
			try {
				const raw = await this.app.vault.read(file);
				const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
				if (!fm) continue;

				const leer = (k: string): string => {
					const m = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(fm[1]);
					if (!m) return "";
					return m[1].trim().replace(/^["'](.*)["']$/, "$1");
				};

				const crudoLic = leer("corresponsal");
				const crudoNom = leer("nombre");
				const fix = this.corregirLicenciaYNombre(crudoLic, crudoNom);

				if (fix.licencia !== crudoLic || fix.nombre !== crudoNom) {
					await this.app.fileManager.processFrontMatter(file, (f: Record<string, unknown>) => {
						f.corresponsal = fix.licencia;
						if (crudoNom || fix.nombre) f.nombre = fix.nombre;
					});
					cambios++;
				}

				const m = /^QSO_(\d{8})_(\d{4})_(?:[a-z0-9]+_)?(.+)$/i.exec(file.basename);
				if (!m || !fix.licencia) continue;
				const nuevo = this.licenciaArchivo(fix.licencia);
				if (nuevo && nuevo !== m[3]) {
					pendientes.push({ file, key: `${m[1]}_${m[2]}`, viejo: m[3], nuevo });
				}
			} catch {
				// Una nota ilegible no debe frenar la normalización
			}
		}

		if (pendientes.length === 0) {
			if (cambios > 0) {
				new Notice(`Bitácora: se normalizaron ${cambios} registros con licencia/nombre`);
			}
			return;
		}

		// QSLs enviadas y recibidas: mismo criterio, la licencia identifica el archivo
		const renombres: { de: string; a: string }[] = [];
		const imgs = this.app.vault.getFiles().filter((i) =>
			i.parent && (i.parent.path === QSL_FOLDER || i.parent.path === SENT_FOLDER)
		);

		for (const img of imgs) {
			const m = /^QSL_(\d{8})_(\d{4})_(.+)$/.exec(img.basename);
			if (!m) continue;
			const p = pendientes.find((x) => x.key === `${m[1]}_${m[2]}`);
			if (!p || p.nuevo === m[3]) continue;
			const destino = `${img.parent?.path}/QSL_${m[1]}_${m[2]}_${p.nuevo}.${img.extension}`;
			if (this.app.vault.getAbstractFileByPath(destino)) continue;
			const rutaVieja = img.path;
			const nombreViejo = img.name;
			const nombreNuevo = `QSL_${m[1]}_${m[2]}_${p.nuevo}.${img.extension}`;
			try {
				await this.app.fileManager.renameFile(img, destino);
				renombres.push({ de: rutaVieja, a: destino });
				renombres.push({ de: nombreViejo, a: nombreNuevo });
				cambios++;
			} catch {
				// Si no se pudo renombrar, queda para la próxima carga
			}
		}

		for (const p of pendientes) {
			// Asegura que los enlaces de la nota apunten al archivo renombrado
			if (renombres.length > 0) {
				await this.app.vault.process(p.file, (data) => {
					let out = data;
					for (const r of renombres) {
						out = out.split(r.de).join(r.a);
					}
					return out;
				});
			}
			const destino = `${FOLDER_NAME}/QSO_${p.key}_${p.nuevo}.md`;
			if (this.app.vault.getAbstractFileByPath(destino)) continue;
			try {
				await this.app.fileManager.renameFile(p.file, destino);
				cambios++;
			} catch {
				// Si no se pudo renombrar, queda para la próxima carga
			}
		}

		if (cambios > 0) {
			new Notice(`Bitácora: se normalizaron ${cambios} registros con licencia/nombre`);
		}
	}

	async listarQSOs(): Promise<FilaQSO[]> {
		const archivos = this.app.vault.getFiles().filter((f) =>
			f.extension === "md" &&
			f.parent?.path === FOLDER_NAME &&
			f.basename.startsWith(QSO_PREFIX)
		);

		const filas: FilaQSO[] = [];

		for (const file of archivos) {
			const fm: Record<string, unknown> = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
			const lic = this.normalizarLicencia((fm.corresponsal as string) ?? "");
			const fix = lic && !this.pareceLicencia(lic) && this.pareceLicencia(fm.nombre as string)
				? this.corregirLicenciaYNombre(fm.corresponsal, fm.nombre)
				: { licencia: lic, nombre: this.normalizarNombre((fm.nombre as string) ?? ""), corregido: false };

			filas.push({
				file,
				licencia: fix.licencia,
				nombre: fix.nombre,
				fecha: ((fm.fecha as string) ?? "").toString(),
				hora: ((fm.hora_utc as string) ?? (fm.hora as string) ?? "").toString(),
				banda: ((fm.banda as string) ?? "").toString(),
				modo: ((fm.modo as string) ?? "").toString(),
				propagacion: ((fm.propagacion as string) ?? "").toString(),
				rst: ((fm.rst as string) ?? "").toString(),
				operador: this.normalizarNombre((fm.operador as string) ?? ""),
				grid: ((fm.grid as string) ?? "").toString().toUpperCase(),
				comentario: this.normalizarNombre((fm.comentario as string) ?? ""),
				qslEnviada: Boolean(fm.qsl_enviada),
				qslRecibida: Boolean(fm.url),
			});
		}

		filas.sort((a, b) => `${b.fecha}_${b.hora}`.localeCompare(`${a.fecha}_${a.hora}`));
		return filas;
	}

	async activateTableView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLA);
		if (existing.length > 0) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_TABLA, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshUI();
	}

	refreshUI() {
		if (this.ribbonIcon) {
			const label = `Abrir ${this.titulo()}`;
			this.ribbonIcon.setAttribute("aria-label", label);
			this.ribbonIcon.setAttribute("title", label);
		}
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGGER)) {
			const view = leaf.view;
			if (view instanceof LoggerView) void view.onOpen();
		}
	}

	async ensureFolder(path: string) {
		const parts = path.split("/");
		let acc = "";
		for (const part of parts) {
			acc = acc ? `${acc}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(acc)) {
				try {
					await this.app.vault.createFolder(acc);
				} catch {
					// Ya existe u otro error: no bloquea el plugin
				}
			}
		}
	}

	async ensureAssets() {
		await this.ensureFolder(IMG_FOLDER);
		await this.ensureFolder(LOGO_FOLDER);

		const assets: [string, string, string][] = [
			["qsl_background.jpg", BG_PATH, BG_B64],
			["escudo.jpg", LOGO_PATH, LOGO_B64],
		];

		for (const [_name, dest, b64] of assets) {
			if (this.app.vault.getAbstractFileByPath(dest)) continue;
			try {
				const binary = this.base64ToBinary(b64);
				await this.app.vault.createBinary(dest, binary);
			} catch {
				// Si no se puede copiar, la tarjeta mostrará un aviso
			}
		}
	}

	base64ToBinary(b64: string): ArrayBuffer {
		const binary = atob(b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes.buffer;
	}

	async migrateFolders() {
		await this.ensureFolder(ROOT_FOLDER);

		const renames: [string, string][] = [
			["QSLs", QSL_FOLDER],
			[`${ROOT_FOLDER}/QSLs`, QSL_FOLDER],
			["QSOs", FOLDER_NAME],
			["QSLs Enviadas", SENT_FOLDER],
			["Img", IMG_FOLDER],
		];

		for (const [from, to] of renames) {
			if (from === to) continue;
			const src = this.app.vault.getAbstractFileByPath(from);
			if (!src) continue;
			if (this.app.vault.getAbstractFileByPath(to)) continue;
			try {
				await this.app.fileManager.renameFile(src, to);
			} catch {
				// Si falla, lo reintenta en la próxima carga
			}
		}
	}

	async onEditorPaste(evt: ClipboardEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
		const file = info.file;
		if (!file || file.extension !== "md" || !file.basename.startsWith(QSO_PREFIX)) return;

		const dt = evt.clipboardData;
		if (!dt) return;

		const images: File[] = [];
		for (let i = 0; i < dt.items.length; i++) {
			const item = dt.items[i];
			if (item.kind === "file" && item.type.startsWith("image/")) {
				const img = item.getAsFile();
				if (img) images.push(img);
			}
		}
		if (images.length === 0) return;

		evt.preventDefault();
		await this.ensureFolder(QSL_FOLDER);

		const base = file.basename.replace(/^QSO_/, "QSL_");
		let saved: string | null = null;

		for (const img of images) {
			try {
				const ext = this.imageExt(img);
				const path = await this.uniquePath(`${QSL_FOLDER}/${base}`, ext);
				const data = await img.arrayBuffer();
				await this.app.vault.createBinary(path, data);
				editor.replaceSelection(`![[${path}]]`);
				if (!saved) saved = path;
			} catch (e) {
				new Notice("Error al guardar la QSL: " + (e instanceof Error ? e.message : String(e)));
				return;
			}
		}

		const link = saved;
		if (link) {
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm.url = `[[${link}]]`;
			});
			new Notice(`QSL guardada en ${QSL_FOLDER}/`);
		}
	}

	imageExt(img: File): string {
		const fromMime = IMAGE_MIME_EXT[img.type];
		if (fromMime) return fromMime;
		const match = /\.([a-z0-9]+)$/i.exec(img.name || "");
		return match ? match[1].toLowerCase() : "png";
	}

	async uniquePath(base: string, ext: string): Promise<string> {
		let path = `${base}.${ext}`;
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${base}_${i}.${ext}`;
			i++;
		}
		return path;
	}

	loadImage(path: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (!(f instanceof TFile)) {
				reject(new Error(`No existe el archivo ${path}`));
				return;
			}
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
			img.src = this.app.vault.getResourcePath(f);
		});
	}

	fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, bold: boolean, start: number, min: number): number {
		let size = start;
		while (size > min) {
			ctx.font = `${bold ? "bold " : ""}${size}px "Segoe UI", sans-serif`;
			if (ctx.measureText(text).width <= maxW) return size;
			size -= 2;
		}
		ctx.font = `${bold ? "bold " : ""}${min}px "Segoe UI", sans-serif`;
		return min;
	}

	truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
		let t = text;
		while (t.length > 4 && ctx.measureText(t + "…").width > maxW) {
			t = t.slice(0, -1);
		}
		return t === text ? text : t + "…";
	}

	async getRandomBackground(): Promise<string> {
		const files = this.app.vault.getFiles().filter(f =>
			f.parent?.path === IMG_FOLDER && IMAGE_EXTS.has(f.extension.toLowerCase())
		);
		if (files.length === 0) return BG_PATH;
		const random = files[Math.floor(Math.random() * files.length)];
		return random.path;
	}

	async generarTarjetaQSL(file: TFile, data?: Record<string, unknown>, fondo?: string) {
		try {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm: Record<string, unknown> = data ?? cache?.frontmatter ?? {};

			const emisor = (fm.emisor as string) ?? (fm.mi_call as string) ?? this.licencia();
			const corresponsal = this.normalizarLicencia((fm.corresponsal as string) ?? "");
			const fecha = (fm.fecha as string) ?? "";
			const hora = (fm.hora_utc as string) ?? (fm.hora as string) ?? "";
			const banda = (fm.banda as string) ?? "";
			const modo = (fm.modo as string) ?? "";
			const rst = (fm.rst as string) ?? (fm.rst_s as string) ?? "";
			const comentario = (fm.comentario as string) ?? "Gracias por el contacto! 73!";

			const line1 = `${emisor} → ${corresponsal} · ${fecha} ${hora} UTC`;
			const line2 = `${banda} · ${modo} · RST ${rst} · ${comentario}`;

			const fondoPath = fondo ?? await this.getRandomBackground();
			let bg: HTMLImageElement;
			try {
				bg = await this.loadImage(fondoPath);
			} catch (e) {
				if (fondo) throw e;
				new Notice(`No se encontró ${fondoPath}, se usa el fondo por defecto`);
				bg = await this.loadImage(BG_PATH);
			}
			let logo: HTMLImageElement | null = null;
			try {
				logo = await this.loadImage(LOGO_PATH);
			} catch {
				new Notice("No se encontró el logo: " + LOGO_PATH);
			}

			const canvas = document.createElement("canvas");
			canvas.width = bg.naturalWidth;
			canvas.height = bg.naturalHeight;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("No se pudo crear el canvas");

			ctx.drawImage(bg, 0, 0);

			// Borde negro de 0.5 cm (a 96 dpi ≈ 19 px)
			const borderPx = Math.round((0.5 / 2.54) * 96);

			if (logo) {
				const margin = borderPx + 12;
				const h = Math.round(canvas.height * 0.176);
				const w = Math.round(h * (logo.naturalWidth / logo.naturalHeight));
				ctx.drawImage(logo, canvas.width - w - margin, margin, w, h);
			}

			const bandH = Math.round(canvas.height * 0.16);
			const bandY = canvas.height - bandH;
			const maxW = canvas.width - borderPx * 2 - 24;
			ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
			ctx.fillRect(0, bandY, canvas.width, bandH);

			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#ffffff";

			this.fitFontSize(ctx, line1, maxW, true, Math.round(bandH * 0.34), 16);
			let text1 = line1;
			if (ctx.measureText(text1).width > maxW) text1 = this.truncate(ctx, text1, maxW);
			ctx.fillText(text1, canvas.width / 2, bandY + bandH * 0.32);

			this.fitFontSize(ctx, line2, maxW, false, Math.round(bandH * 0.26), 14);
			let text2 = line2;
			if (ctx.measureText(text2).width > maxW) text2 = this.truncate(ctx, text2, maxW);
			ctx.fillText(text2, canvas.width / 2, bandY + bandH * 0.68);

			// Marco negro sobre todo el dibujo
			ctx.lineWidth = borderPx;
			ctx.strokeStyle = "#000000";
			ctx.strokeRect(borderPx / 2, borderPx / 2, canvas.width - borderPx, canvas.height - borderPx);

			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b: Blob | null) => (b ? resolve(b) : reject(new Error("No se pudo exportar la imagen"))),
					"image/jpeg",
					0.92
				);
			});
			const bytes = await blob.arrayBuffer();

			const base = file.basename.replace(/^QSO_/, "QSL_");
			const path = `${SENT_FOLDER}/${base}.jpg`;
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				await this.app.vault.modifyBinary(existing, bytes);
			} else {
				await this.app.vault.createBinary(path, bytes);
			}

			await this.app.fileManager.processFrontMatter(file, (f: Record<string, unknown>) => {
				f.qsl_enviada = `[[${path}]]`;
			});

			new Notice(`Tarjeta QSL generada: ${base}.jpg`);
		} catch (e) {
			new Notice("Error al generar la tarjeta: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	adifField(name: string, value: string): string {
		if (!value) return "";
		const len = new TextEncoder().encode(value).length;
		return `<${name}:${len}>${value} `;
	}

	async exportarADIF() {
		try {
			const files = this.app.vault.getFiles().filter((f) =>
				f.extension === "md" &&
				f.parent?.path === FOLDER_NAME &&
				f.basename.startsWith(QSO_PREFIX)
			);

			const rows: { key: string; line: string }[] = [];

			for (const f of files) {
				const fm: Record<string, unknown> = this.app.metadataCache.getFileCache(f)?.frontmatter ?? {};
				const fix = this.corregirLicenciaYNombre((fm.corresponsal as string) ?? "", (fm.nombre as string) ?? "");
				const call = fix.licencia;
				if (!call) continue;

			const emisor = ((fm.emisor as string) ?? (fm.mi_call as string) ?? this.licencia()).toString().trim().toUpperCase();
			const nombre = fix.nombre;
			const operador = ((fm.operador as string) ?? this.settings.operador ?? "").toString().trim();
			const ituZone = ((fm.itu_zone as string) ?? this.settings.ituZone ?? "").toString().trim();
			const cqZone = ((fm.cq_zone as string) ?? this.settings.cqZone ?? "").toString().trim();
			const grid = ((fm.grid as string) ?? this.settings.grid ?? "").toString().trim().toUpperCase();
				const fecha = ((fm.fecha as string) ?? "").toString().trim().replace(/-/g, "");
				const hora = ((fm.hora_utc as string) ?? (fm.hora as string) ?? "").toString().trim().replace(":", "");
				const banda = ((fm.banda as string) ?? "").toString().trim().toUpperCase();
				let modo = ((fm.modo as string) ?? "").toString().trim().toUpperCase();
				if (modo === "ECHOLINK") modo = "DV";
				const rstSent = ((fm.rst as string) ?? (fm.rst_s as string) ?? "").toString().trim();
				const rstRcvd = ((fm.rst as string) ?? (fm.rst_r as string) ?? rstSent).toString().trim();
				const prop = ((fm.propagacion as string) ?? "").toString().trim().toUpperCase();
				const comentario = ((fm.comentario as string) ?? "").toString().trim();

				let line = "";
				line += this.adifField("call", call);
				line += this.adifField("qso_date", fecha);
				line += this.adifField("time_on", hora);
				line += this.adifField("band", banda);
				line += this.adifField("mode", modo);
				line += this.adifField("station_callsign", emisor);
				line += this.adifField("operator", emisor);
				line += this.adifField("my_name", operador);
				line += this.adifField("my_itu_zone", ituZone);
				line += this.adifField("my_cq_zone", cqZone);
				line += this.adifField("my_gridsquare", grid);
				line += this.adifField("name", nombre);
				line += this.adifField("rst_sent", rstSent);
				line += this.adifField("rst_rcvd", rstRcvd);
				if (prop === "SAT") line += this.adifField("prop_mode", "SAT");
				line += this.adifField("comment", comentario);
				line += "<eor>";

				rows.push({ key: `${fecha}_${hora}_${call}`, line });
			}

			if (rows.length === 0) {
				new Notice("No hay QSOs para exportar");
				return;
			}

			rows.sort((a, b) => a.key.localeCompare(b.key));

			const header =
				`Bitácora ${this.licencia()} - exportación ADIF\n` +
				this.adifField("adif_ver", "3.1.4") +
				this.adifField("programid", "bitacora_rc") +
				this.adifField("exported", new Date().toISOString().slice(0, 16).replace("T", " ")) +
				"<eoh>\n";

			const body = rows.map((r) => r.line + "\n").join("");
			const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `QSOs_${this.licencia()}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.adi`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			new Notice(`${rows.length} QSOs exportados a ADIF`);
		} catch (e) {
			new Notice("Error al exportar ADIF: " + (e instanceof Error ? e.message : String(e)));
		}
	}

	importarADIF(): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".adi,.adif";
		input.addEventListener("change", (e: Event) => {
			void (async () => {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) {
					return;
				}
				try {
					const text = await file.text();
					const qsos = this.parseADIF(text);
					if (qsos.length === 0) {
						new Notice("No se encontraron QSOs válidos en el archivo ADIF");
						return;
					}
					await this.ensureFolder(FOLDER_NAME);
					let creados = 0;
					let omitidos = 0;
					for (const qso of qsos) {
						const call = this.normalizarLicencia(qso.call);
						if (!call) {
							omitidos++;
							continue;
						}
						const fecha = qso.qso_date ?? "";
						const hora = qso.time_on ?? "";
						if (!fecha || !hora) {
							omitidos++;
							continue;
						}
						const banda = (qso.band ?? "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
						const filename = `QSO_${fecha}_${hora}_${banda}_${this.licenciaArchivo(call)}.md`;
						const filepath = `${FOLDER_NAME}/${filename}`;
						if (this.app.vault.getAbstractFileByPath(filepath)) {
							omitidos++;
							continue;
						}
						const content = `---
emisor: ${qso.station_callsign ?? this.licencia()}
corresponsal: ${call}
nombre: ${qso.name ?? ""}
fecha: ${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}
hora_utc: ${hora.slice(0, 2)}:${hora.slice(2, 4)}
banda: ${qso.band ?? ""}
modo: ${qso.mode ?? ""}
propagacion: ${qso.prop_mode === "SAT" ? "SAT" : "---"}
rst: ${qso.rst_sent ?? qso.rst_rcvd ?? ""}
operador: ${qso.operator ?? qso.my_name ?? this.settings.operador}
itu_zone: ${qso.my_itu_zone ?? this.settings.ituZone}
cq_zone: ${qso.my_cq_zone ?? this.settings.cqZone}
grid: ${qso.my_gridsquare ?? this.settings.grid}
url: ""
comentario: ${qso.comment ?? "Gracias por el contacto! 73!"}
---
${qso.comment ?? "Gracias por el contacto! 73!"}
`;
						try {
							await this.app.vault.create(filepath, content);
							creados++;
						} catch {
							omitidos++;
						}
					}
					new Notice(`Importación ADIF: ${creados} QSOs creados, ${omitidos} omitidos (duplicados o inválidos)`);
					// Refrescar vista si está abierta
					for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_LOGGER)) {
						const view = leaf.view;
						if (view instanceof LoggerView) void view.onOpen();
					}
					for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TABLA)) {
						const view = leaf.view;
						if (view instanceof QsoTableView) void view.render();
					}
				} catch (err) {
					new Notice("Error al importar ADIF: " + (err instanceof Error ? err.message : String(err)));
				}
			})();
		});
		input.click();
	}

	parseADIF(text: string): Record<string, string>[] {
		const records: Record<string, string>[] = [];
		const lines = text.split(/\r?\n/);
		let inHeader = true;
		let currentRecord: Record<string, string> = {};
		let buffer = "";

		for (const line of lines) {
			buffer += line + "\n";
			if (inHeader) {
				if (buffer.toLowerCase().includes("<eoh>")) {
					inHeader = false;
					buffer = "";
				}
				continue;
			}

			const fieldRegex = /<(\w+):(\d+)>([^<]*)/g;
			let match;
			while ((match = fieldRegex.exec(buffer)) !== null) {
				const [, name, lenStr, value] = match;
				const len = parseInt(lenStr, 10);
				if (value.length >= len) {
					currentRecord[name.toLowerCase()] = value.slice(0, len);
				}
			}

			if (buffer.toLowerCase().includes("<eor>")) {
				if (Object.keys(currentRecord).length > 0) {
					records.push(currentRecord);
				}
				currentRecord = {};
				buffer = "";
			}
		}
		return records;
	}

	async activateView() {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_LOGGER);

		if (existing.length > 0) {
			await workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice("No se pudo abrir el panel lateral");
			return;
		}
		await leaf.setViewState({ type: VIEW_TYPE_LOGGER, active: true });
		await workspace.revealLeaf(leaf);
	}
}

// === VISTA DEL FORMULARIO ===
class LoggerView extends ItemView {
	private plugin: LoggerPlugin;

	constructor(leaf: WorkspaceLeaf, app: App, plugin: LoggerPlugin) {
		super(leaf);
		this.app = app;
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_LOGGER;
	}

	getDisplayText() {
		return this.plugin.titulo();
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		// Header image section
		await this.renderHeaderImage(container);

		container.createEl("h3", { text: `📻 ${this.plugin.titulo()}`, cls: "logger-title" });

		const formDiv = container.createDiv({ cls: "logger-form" });

		const rowField = (label: string, full = false) => {
			const row = formDiv.createDiv({
				cls: full ? "logger-field logger-field--full" : "logger-field",
			});
			row.createEl("label", { text: label, cls: "logger-label" });
			return row;
		};

		const fillSelect = (sel: HTMLSelectElement, values: string[], def: string) => {
			for (const v of values) sel.createEl("option", { value: v, text: v });
			sel.value = def;
		};

		const now = new Date();
		const fechaHoy = now.toISOString().slice(0, 10);
		const horaUTC = now.toISOString().slice(11, 16);

		// Licencia del corresponsal
		const rowCall = rowField("Licencia");
		const inputCall = rowCall.createEl("input", {
			type: "text",
			placeholder: "Licencia (ej. LU1XXX)",
			cls: "logger-input",
		});

		const rowNombre = rowField("Nombre");
		const inputNombre = rowNombre.createEl("input", {
			type: "text",
			placeholder: "Nombre (opcional)",
			cls: "logger-input",
		});

		// Fecha (hoy por defecto, editable)
		const rowFecha = rowField("Fecha");
		const inputFecha = rowFecha.createEl("input", {
			type: "date",
			value: fechaHoy,
			cls: "logger-input",
		});

		// Hora UTC (editable)
		const rowHora = rowField("Hora UTC");
		const inputHora = rowHora.createEl("input", {
			type: "time",
			value: horaUTC,
			cls: "logger-input",
		});

		// Banda
		const rowBanda = rowField("Banda");
		const selectBanda = rowBanda.createEl("select", { cls: "logger-input" });
		fillSelect(selectBanda, ["80m", "40m", "20m", "17m", "15m", "12m", "10m", "6m", "4m", "2m", "70cm"], "40m");

		// Modo
		const rowModo = rowField("Modo");
		const selectModo = rowModo.createEl("select", { cls: "logger-input" });
		fillSelect(selectModo, ["SSB", "CW", "AM", "FM", "DV", "RTTY", "ECHOLINK"], "SSB");

		// Propagación
		const rowProp = rowField("Propagación");
		const selectProp = rowProp.createEl("select", { cls: "logger-input" });
		fillSelect(selectProp, ["---", "SAT", "RPT", "INTERNET"], "---");

		// RST manual
		const rowRst = rowField("RST");
		const inputRst = rowRst.createEl("input", {
			type: "text",
			placeholder: "Manual (ej. 59)",
			cls: "logger-input",
		});

		// Comentario (ancho completo)
		const rowCom = rowField("Comentario", true);
		const inputCom = rowCom.createEl("textarea", {
			text: "Gracias por el contacto! 73!",
			cls: "logger-input",
		});
		inputCom.rows = 3;

		// Fila 1: Guardar QSO + Tabla
		const rowActions1 = formDiv.createDiv({ cls: "logger-actions" });

		// Botón Guardar
		const btnSave = rowActions1.createEl("button", {
			text: "💾 Guardar QSO",
			cls: "logger-save mod-cta",
		});

		// Botón Tabla de QSOs
		const btnTabla = rowActions1.createEl("button", {
			text: "📋 Tabla",
			cls: "logger-export",
		});
		btnTabla.addEventListener("click", () => {
			void this.plugin.activateTableView();
		});

		// Fila 2: Exportar ADIF + Importar ADIF
		const rowActions2 = formDiv.createDiv({ cls: "logger-actions" });

		// Botón Exportar ADIF
		const btnExport = rowActions2.createEl("button", {
			text: "📤 Exportar ADIF",
			cls: "logger-export",
		});
		btnExport.addEventListener("click", () => {
			void this.plugin.exportarADIF();
		});

		// Botón Importar ADIF
		const btnImport = rowActions2.createEl("button", {
			text: "📥 Importar ADIF",
			cls: "logger-export",
		});
		btnImport.addEventListener("click", () => {
			void this.plugin.importarADIF();
		});

		// Acción al hacer clic
		btnSave.addEventListener("click", () => {
			void (async () => {
				const fix = this.plugin.corregirLicenciaYNombre(inputCall.value, inputNombre.value);
				const call = fix.licencia;
				const nombre = fix.nombre;

				if (!call) {
					new Notice("Debe ingresar la licencia");
					return;
				}
				if (fix.corregido) {
					new Notice(`Licencia y Nombre estaban invertidos: se corrigió (${call})`);
				} else if (!this.plugin.pareceLicencia(call)) {
					new Notice(`⚠ "${call}" no parece una distintiva (ej. LU9EFF). Verificá el dato.`);
				}

				inputCall.value = call;
				inputNombre.value = nombre;

				const emisor = this.plugin.licencia();
				const operador = this.plugin.settings.operador;
				const ituZone = this.plugin.settings.ituZone;
				const cqZone = this.plugin.settings.cqZone;
				const grid = this.plugin.settings.grid;
				const fecha = inputFecha.value || fechaHoy;
				const hora = inputHora.value || horaUTC;
				const banda = selectBanda.value;
				const modo = selectModo.value;
				const prop = selectProp.value;
				const rst = inputRst.value.trim();
				const comentario = this.plugin.normalizarNombre(inputCom.value);

				const filename = `QSO_${fecha.replace(/-/g, '')}_${hora.replace(':', '')}_${banda.toLowerCase().replace(/[^a-z0-9]/g, '')}_${this.plugin.licenciaArchivo(call)}.md`;
				const filepath = `${FOLDER_NAME}/${filename}`;

				if (this.app.vault.getAbstractFileByPath(filepath)) {
					new Notice(`Ya existe un QSO con ${call} en ${fecha} ${hora}`);
					return;
				}

				const content = `---
emisor: ${emisor}
corresponsal: ${call}
nombre: ${nombre}
fecha: ${fecha}
hora_utc: ${hora}
banda: ${banda}
modo: ${modo}
propagacion: ${prop}
rst: ${rst}
operador: ${operador}
itu_zone: ${ituZone}
cq_zone: ${cqZone}
grid: ${grid}
url: ""
comentario: ${comentario}
---
${comentario}
`;
				try {
					await this.app.vault.create(filepath, content);
					new Notice(`QSO con ${call} guardado con éxito!`);
					inputCall.value = "";
					inputNombre.value = "";
					inputRst.value = "";

					// Generar la tarjeta QSL si está habilitado
					if (this.plugin.settings.autoGenerarQSL) {
						const created = this.app.vault.getAbstractFileByPath(filepath);
						if (created instanceof TFile) {
							const qslData = {
								emisor,
								corresponsal: call,
								nombre,
								fecha,
								hora_utc: hora,
								banda,
								modo,
								propagacion: prop,
								rst,
								operador,
								itu_zone: ituZone,
								cq_zone: cqZone,
								grid,
								comentario,
							};
							new QSLFondoModal(this.app, this.plugin, (usarAleatorio: boolean) => {
								void (async () => {
									if (usarAleatorio) {
										await this.plugin.generarTarjetaQSL(created, qslData);
									} else {
										new FondoQSLModal(this.app, this.plugin, (fondo) => {
											void this.plugin.generarTarjetaQSL(created, qslData, fondo);
										}).open();
									}
								})();
							}).open();
						}
					}
				} catch (e) {
					new Notice("Error al guardar: " + (e instanceof Error ? e.message : String(e)));
				}
			})();
		});
	}

	async renderHeaderImage(container: HTMLElement) {
		const headerFolder = `${ROOT_FOLDER}/Img`;
		const files = this.app.vault.getFiles().filter(f =>
			f.parent?.path === headerFolder && IMAGE_EXTS.has(f.extension.toLowerCase())
		);

		if (files.length === 0) return;

		// Usar la primera imagen encontrada (o se podría agregar lógica para seleccionar una específica)
		const headerFile = files[0];

		try {
			const headerDiv = container.createDiv({ cls: "logger-header-image" });

			const headerImg = headerDiv.createEl("img", {
				cls: "logger-header-img",
			});
			headerImg.src = this.app.vault.getResourcePath(headerFile);

			// Detectar si la imagen es ancha (landscape) para decidir el estilo
			headerImg.onload = () => {
				const aspectRatio = headerImg.naturalWidth / headerImg.naturalHeight;
				if (aspectRatio >= 1.5) {
					headerDiv.addClass("logger-header--wide");
				} else {
					headerDiv.addClass("logger-header--narrow");
				}
			};

			// Click para cambiar imagen
			headerDiv.addEventListener("click", () => {
				new FondoQSLModal(this.app, this.plugin, (nuevaRuta) => {
					void (async () => {
						if (nuevaRuta) {
							const file = this.app.vault.getAbstractFileByPath(nuevaRuta);
							if (file instanceof TFile) {
								headerImg.src = this.app.vault.getResourcePath(file);
								const newImg = await this.plugin.loadImage(nuevaRuta);
								const aspectRatio = newImg.naturalWidth / newImg.naturalHeight;
								headerDiv.classList.remove("logger-header--wide", "logger-header--narrow");
								if (aspectRatio >= 1.5) {
									headerDiv.addClass("logger-header--wide");
								} else {
									headerDiv.addClass("logger-header--narrow");
								}
							}
						}
					})();
				}).open();
			});

			headerDiv.createEl("span", { text: "Clic para cambiar", cls: "logger-header-hint" });
		} catch (e) {
			console.warn("No se pudo cargar la imagen de header:", e);
		}
	}

	async onClose() {
		// Limpiar si es necesario al cerrar el panel
	}
}

// === VISTA CON LA TABLA DE QSOs ===
class QsoTableView extends ItemView {
	private plugin: LoggerPlugin;

	constructor(leaf: WorkspaceLeaf, app: App, plugin: LoggerPlugin) {
		super(leaf);
		this.app = app;
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_TABLA;
	}

	getDisplayText() {
		return "Tabla de QSOs";
	}

	async onOpen() {
		await this.render();
	}

	async render() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl("h3", { text: "📋 QSOs realizados", cls: "logger-title" });

		const barra = container.createDiv({ cls: "qso-tabla-barra" });
		const btnActualizar = barra.createEl("button", { text: "🔄 Actualizar", cls: "logger-export" });
		btnActualizar.addEventListener("click", () => void this.render());

		const filas = await this.plugin.listarQSOs();

		if (filas.length === 0) {
			container.createEl("p", { text: "Todavía no hay QSOs cargados.", cls: "qso-tabla-vacio" });
			return;
		}

		barra.createSpan({ text: `${filas.length} QSO`, cls: "qso-tabla-contador" });

		const wrap = container.createDiv({ cls: "qso-tabla-wrap" });
		const tabla = wrap.createEl("table", { cls: "qso-tabla" });
		const thead = tabla.createEl("thead");
		const tr = thead.createEl("tr");
		const columnas: [keyof FilaQSO, string][] = [
			["fecha", "Fecha"],
			["hora", "Hora UTC"],
			["licencia", "Licencia"],
			["nombre", "Nombre"],
			["banda", "Banda"],
			["modo", "Modo"],
			["propagacion", "Prop."],
			["rst", "RST"],
			["operador", "Operador"],
			["grid", "Grid"],
		];
		for (const [, label] of columnas) tr.createEl("th", { text: label });
		tr.createEl("th", { text: "QSL env." });
		tr.createEl("th", { text: "QSL rec." });

		const tbody = tabla.createEl("tbody");
		for (const q of filas) {
			const row = tbody.createEl("tr", { cls: "qso-tabla-fila" });
			for (const [key] of columnas) {
				row.createEl("td", { text: String(q[key] ?? "") });
			}
			row.createEl("td", { text: q.qslEnviada ? "✓" : "—" , cls: q.qslEnviada ? "qsi" : "qno" });
			row.createEl("td", { text: q.qslRecibida ? "✓" : "—" , cls: q.qslRecibida ? "qsi" : "qno" });
			row.addEventListener("click", () => {
				void this.app.workspace.openLinkText(q.file.path, "", false);
			});
		}

		container.createEl("p", {
			text: "Hacé clic en una fila para abrir el QSO. Licencia identifica el QSO y sus QSL.",
			cls: "qso-tabla-pie",
		});
	}

	async onClose() {
		// Nada que limpiar
	}
}

// === MODAL PARA ELEGIR TIPO DE FONDO QSL ===
class QSLFondoModal extends FuzzySuggestModal<string> {
	private plugin: LoggerPlugin;
	private onPick: (usarAleatorio: boolean) => void;

	constructor(app: App, plugin: LoggerPlugin, onPick: (usarAleatorio: boolean) => void) {
		super(app);
		this.plugin = plugin;
		this.onPick = onPick;
		this.setPlaceholder("Seleccionar tipo de fondo…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navegar" },
			{ command: "↵", purpose: "confirmar" },
		]);
	}

	getItems(): string[] {
		return ["usar-aleatorio", "elegir-fondo"];
	}

	getItemText(item: string): string {
		return item === "usar-aleatorio" ? "🎲 Usar fondo aleatorio" : "🖼️ Elegir fondo específico";
	}

	onChooseItem(item: string): void {
		this.onPick(item === "usar-aleatorio");
	}
}

// === MODAL PARA ELEGIR EL FONDO DE LA QSL ===
const OPCION_SUBIR = "__SUBIR_IMAGEN__";

class FondoQSLModal extends FuzzySuggestModal<string> {
	private plugin: LoggerPlugin;
	private onPick: (ruta: string) => void;

	constructor(app: App, plugin: LoggerPlugin, onPick: (ruta: string) => void) {
		super(app);
		this.plugin = plugin;
		this.onPick = onPick;
		this.setPlaceholder("Buscar imagen de fondo en BITACORA DE RADIO/Img…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navegar" },
			{ command: "↵", purpose: "usar como fondo" },
		]);
	}

	getItems(): string[] {
		const imgs = this.app.vault
			.getFiles()
			.filter((f) => f.parent?.path === IMG_FOLDER && IMAGE_EXTS.has(f.extension.toLowerCase()))
			.map((f) => f.path)
			.sort();
		return [OPCION_SUBIR, ...imgs];
	}

	getItemText(item: string): string {
		return item === OPCION_SUBIR ? "📁 Subir imagen del equipo…" : item;
	}

	onChooseItem(item: string): void {
		if (item === OPCION_SUBIR) {
			void (async () => {
				const ruta = await this.plugin.subirImagenEquipo();
				if (ruta) this.onPick(ruta);
			})();
			return;
		}
		this.onPick(item);
	}
}

// === AJUSTES DEL PLUGIN ===
class BitacoraSettingsTab extends PluginSettingTab {
	plugin: LoggerPlugin;

	constructor(app: App, plugin: LoggerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Bitácora de radioaficionado")
			.setHeading();

		new Setting(containerEl)
			.setName("Licencia")
			.setDesc("Distintiva propia. Se usa en el título, en el ADIF y en la primera fila del formulario.")
			.addText((text) =>
				text
					.setPlaceholder("LU9EFF")
					.setValue(this.plugin.settings.licencia)
					.onChange(async (value) => {
						this.plugin.settings.licencia = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Nombre de operador")
			.setDesc("Tu nombre. Se guarda en cada QSO y se exporta como my_name en el ADIF.")
			.addText((text) =>
				text
					.setPlaceholder("Nombre y apellido")
					.setValue(this.plugin.settings.operador)
					.onChange(async (value) => {
						this.plugin.settings.operador = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("ITU Zone")
			.setDesc("Zona ITU de tu estación (ej. 13).")
			.addText((text) =>
				text
					.setPlaceholder("13")
					.setValue(this.plugin.settings.ituZone)
					.onChange(async (value) => {
						this.plugin.settings.ituZone = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("CQ Zone")
			.setDesc("Zona CQ de tu estación (ej. 13).")
			.addText((text) =>
				text
					.setPlaceholder("13")
					.setValue(this.plugin.settings.cqZone)
					.onChange(async (value) => {
						this.plugin.settings.cqZone = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("GRID Locator")
			.setDesc("Tu locador Maidenhead (ej. GF05).")
			.addText((text) =>
				text
					.setPlaceholder("GF05")
					.setValue(this.plugin.settings.grid)
					.onChange(async (value) => {
						this.plugin.settings.grid = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Generar QSL automáticamente al guardar")
			.setDesc("Crea la tarjeta QSL en 'QSLs Enviadas' cada vez que guardás un QSO")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoGenerarQSL)
					.onChange(async (value) => {
						this.plugin.settings.autoGenerarQSL = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
