import { describe, expect, test } from "bun:test";
import { resolveEnvDefaults } from "./page";

describe("resolveEnvDefaults", () => {
	test("returns empty defaults with no env vars", () => {
		expect(resolveEnvDefaults({})).toEqual({});
	});

	// THRALL_BROWSER
	test("THRALL_BROWSER sets executablePath", () => {
		expect(resolveEnvDefaults({ THRALL_BROWSER: "/usr/bin/chromium" })).toEqual(
			{ executablePath: "/usr/bin/chromium" },
		);
	});

	// THRALL_ARGS
	test("THRALL_ARGS sets args array", () => {
		expect(
			resolveEnvDefaults({ THRALL_ARGS: "--no-sandbox,--disable-gpu" }),
		).toEqual({ args: ["--no-sandbox", "--disable-gpu"] });
	});

	test("THRALL_ARGS trims whitespace", () => {
		expect(
			resolveEnvDefaults({ THRALL_ARGS: " --no-sandbox , --disable-gpu " }),
		).toEqual({ args: ["--no-sandbox", "--disable-gpu"] });
	});
});
