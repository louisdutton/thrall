/**
 * Screencast - record browser sessions as video via CDP
 */

import { CDPSession } from "./cdp";

interface ScreencastOptions {
	/** Image format for frames */
	format?: "jpeg" | "png";
	/** JPEG quality (0-100), only applicable for jpeg format */
	quality?: number;
	/** Maximum width of frames */
	maxWidth?: number;
	/** Maximum height of frames */
	maxHeight?: number;
	/** Frames per second to capture */
	everyNthFrame?: number;
}

interface ScreencastFrame {
	data: Buffer;
	timestamp: number;
	metadata: {
		offsetTop: number;
		pageScaleFactor: number;
		deviceWidth: number;
		deviceHeight: number;
		scrollOffsetX: number;
		scrollOffsetY: number;
	};
}

export class Screencast {
	private cdp: CDPSession;
	private frames: ScreencastFrame[] = [];
	private recording = false;
	private frameHandler: ((params: any) => void) | null = null;
	private options: Required<ScreencastOptions>;

	constructor(cdp: CDPSession, options: ScreencastOptions = {}) {
		this.cdp = cdp;
		this.options = {
			format: options.format ?? "jpeg",
			quality: options.quality ?? 80,
			maxWidth: options.maxWidth ?? 1280,
			maxHeight: options.maxHeight ?? 720,
			everyNthFrame: options.everyNthFrame ?? 1,
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

		this.frameHandler = async (params: {
			data: string;
			metadata: ScreencastFrame["metadata"];
			sessionId: number;
		}) => {
			if (!this.recording) return;

			this.frames.push({
				data: Buffer.from(params.data, "base64"),
				timestamp: Date.now(),
				metadata: params.metadata,
			});

			// Acknowledge frame to receive next one
			await this.cdp.send("Page.screencastFrameAck", {
				sessionId: params.sessionId,
			});
		};

		this.cdp.on("Page.screencastFrame", this.frameHandler);

		await this.cdp.send("Page.startScreencast", {
			format: this.options.format,
			quality: this.options.quality,
			maxWidth: this.options.maxWidth,
			maxHeight: this.options.maxHeight,
			everyNthFrame: this.options.everyNthFrame,
		});
	}

	/**
	 * Stop recording and return captured frames
	 */
	async stop(): Promise<ScreencastFrame[]> {
		if (!this.recording) {
			throw new Error("Screencast not recording");
		}

		await this.cdp.send("Page.stopScreencast");

		if (this.frameHandler) {
			this.cdp.off("Page.screencastFrame", this.frameHandler);
			this.frameHandler = null;
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

			// Use ffmpeg to create video
			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -c:v libx264 -pix_fmt yuv420p -preset fast ${outputPath}`.quiet();
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
			const paletteFile = `${tempDir}/palette.png`;
			const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;

			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -vf "${filters},palettegen" ${paletteFile}`.quiet();
			await Bun.$`ffmpeg -y -framerate ${fps} -i ${pattern} -i ${paletteFile} -lavfi "${filters} [x]; [x][1:v] paletteuse" ${outputPath}`.quiet();
		} finally {
			// Cleanup temp directory
			await Bun.$`rm -rf ${tempDir}`;
		}
	}
}
