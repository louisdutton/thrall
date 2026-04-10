/**
 * Screencast - record browser sessions via periodic screenshots
 */

export interface ScreencastOptions {
	/** Image format for frames */
	format?: "jpeg" | "png";
	/** JPEG quality (0-100), only applicable for jpeg format */
	quality?: number;
	/** Maximum width of frames */
	maxWidth?: number;
	/** Maximum height of frames */
	maxHeight?: number;
	/** Capture interval in ms (default: 100 = ~10fps) */
	interval?: number;
}

interface ScreencastFrame {
	data: Buffer;
	timestamp: number;
}

export class Screencast {
	private view: InstanceType<typeof Bun.WebView>;
	private frames: ScreencastFrame[] = [];
	private recording = false;
	private timer: ReturnType<typeof setInterval> | null = null;
	private options: Required<ScreencastOptions>;

	constructor(
		view: InstanceType<typeof Bun.WebView>,
		options: ScreencastOptions = {},
	) {
		this.view = view;
		this.options = {
			format: options.format ?? "jpeg",
			quality: options.quality ?? 80,
			maxWidth: options.maxWidth ?? 1280,
			maxHeight: options.maxHeight ?? 720,
			interval: options.interval ?? 100,
		};
	}

	/**
	 * Start recording the screen
	 */
	async start(): Promise<void> {
		if (this.recording) {
			throw new Error("Screencast already recording");
		}

		this.frames = [];
		this.recording = true;

		const capture = async () => {
			if (!this.recording) return;
			try {
				const blob = await this.view.screenshot({
					format: this.options.format,
					quality:
						this.options.format === "jpeg" ? this.options.quality : undefined,
				});
				this.frames.push({
					data: Buffer.from(await blob.arrayBuffer()),
					timestamp: Date.now(),
				});
			} catch {
				// Ignore capture errors (e.g. page navigating)
			}
		};

		// Capture first frame immediately
		await capture();

		this.timer = setInterval(capture, this.options.interval);
	}

	/**
	 * Stop recording and return captured frames
	 */
	async stop(): Promise<ScreencastFrame[]> {
		if (!this.recording) {
			throw new Error("Screencast not recording");
		}

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}

		this.recording = false;
		return this.frames;
	}

	/**
	 * Check if currently recording
	 */
	isRecording(): boolean {
		return this.recording;
	}

	/**
	 * Get current frame count
	 */
	frameCount(): number {
		return this.frames.length;
	}

	/**
	 * Save frames as individual images to a directory
	 */
	async saveFrames(dir: string): Promise<string[]> {
		const paths: string[] = [];
		const ext = this.options.format === "png" ? "png" : "jpg";

		for (let i = 0; i < this.frames.length; i++) {
			const frame = this.frames[i]!;
			const filename = `frame-${String(i).padStart(5, "0")}.${ext}`;
			const path = `${dir}/${filename}`;
			await Bun.write(path, frame.data);
			paths.push(path);
		}

		return paths;
	}

	/**
	 * Save as video using ffmpeg (requires ffmpeg to be installed)
	 * @param outputPath - Path to output video file (e.g., "recording.mp4")
	 * @param options.fps - Frames per second for output video (default: calculated from actual framerate)
	 */
	async saveVideo(
		outputPath: string,
		options: { fps?: number } = {},
	): Promise<void> {
		if (this.frames.length === 0) {
			throw new Error("No frames to save");
		}

		// Calculate actual FPS from timestamps if not specified
		let fps = options.fps;
		if (!fps && this.frames.length > 1) {
			const firstFrame = this.frames[0]!;
			const lastFrame = this.frames[this.frames.length - 1]!;
			const duration = (lastFrame.timestamp - firstFrame.timestamp) / 1000;
			fps = Math.round(this.frames.length / duration) || 10;
		}
		fps = fps ?? 10;

		// Create temp directory for frames
		const tempDir = `/tmp/thrall-screencast-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;

		try {
			// Save all frames
			await this.saveFrames(tempDir);

			const ext = this.options.format === "png" ? "png" : "jpg";
			const pattern = `${tempDir}/frame-%05d.${ext}`;

			// Use ffmpeg to create video (pad to even dimensions for h264 compatibility)
			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -vf "pad=ceil(iw/2)*2:ceil(ih/2)*2" -c:v libx264 -pix_fmt yuv420p -preset fast ${outputPath}`.quiet();
		} finally {
			// Cleanup temp directory
			await Bun.$`rm -rf ${tempDir}`;
		}
	}

	/**
	 * Save as animated GIF using ffmpeg
	 * @param outputPath - Path to output GIF file
	 * @param options.fps - Frames per second (default: calculated, max 15 for GIF)
	 * @param options.width - Width of GIF (default: 480)
	 */
	async saveGif(
		outputPath: string,
		options: { fps?: number; width?: number } = {},
	): Promise<void> {
		if (this.frames.length === 0) {
			throw new Error("No frames to save");
		}

		const width = options.width ?? 480;

		// Calculate actual FPS from timestamps if not specified
		let fps = options.fps;
		if (!fps && this.frames.length > 1) {
			const firstFrame = this.frames[0]!;
			const lastFrame = this.frames[this.frames.length - 1]!;
			const duration = (lastFrame.timestamp - firstFrame.timestamp) / 1000;
			fps = Math.min(15, Math.round(this.frames.length / duration) || 10);
		}
		fps = Math.min(15, fps ?? 10);

		// Create temp directory for frames
		const tempDir = `/tmp/thrall-screencast-${Date.now()}`;
		await Bun.$`mkdir -p ${tempDir}`;

		try {
			// Save all frames
			await this.saveFrames(tempDir);

			const ext = this.options.format === "png" ? "png" : "jpg";
			const pattern = `${tempDir}/frame-%05d.${ext}`;

			// Use ffmpeg to create GIF with palette for better quality
			// pad to even dimensions first, then scale for GIF
			const paletteFile = `${tempDir}/palette.png`;
			const filters = `pad=ceil(iw/2)*2:ceil(ih/2)*2,fps=${fps},scale=${width}:-1:flags=lanczos`;

			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -vf "${filters},palettegen" ${paletteFile}`.quiet();
			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -i ${paletteFile} -lavfi "${filters} [x]; [x][1:v] paletteuse" ${outputPath}`.quiet();
		} finally {
			// Cleanup temp directory
			await Bun.$`rm -rf ${tempDir}`;
		}
	}
}
