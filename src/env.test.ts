import { describe, expect, test } from "bun:test";
import { resolveEnvDefaults } from "./browser";

describe("resolveEnvDefaults", () => {
	test("returns empty defaults with no env vars", () => {
		expect(resolveEnvDefaults({})).toEqual({});
	});

	// THRALL_HEADED
	test("THRALL_HEADED=1 sets headless: false", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "1" })).toEqual({
			headless: false,
		});
	});

	test("THRALL_HEADED=true sets headless: false", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "true" })).toEqual({
			headless: false,
		});
	});

	test("THRALL_HEADED=0 sets headless: true", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "0" })).toEqual({
			headless: true,
		});
	});

	// THRALL_BROWSER
	test("THRALL_BROWSER sets executablePath", () => {
		expect(
			resolveEnvDefaults({ THRALL_BROWSER: "/usr/bin/chromium" }),
		).toEqual({ executablePath: "/usr/bin/chromium" });
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

	// boolean parsing edge cases
	test("yes/no are valid booleans", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "yes" })).toEqual({
			headless: false,
		});
		expect(resolveEnvDefaults({ THRALL_HEADED: "no" })).toEqual({
			headless: true,
		});
	});

	test("empty string is falsy", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "" })).toEqual({
			headless: true,
		});
	});

	test("unrecognized values are ignored", () => {
		expect(resolveEnvDefaults({ THRALL_HEADED: "maybe" })).toEqual({});
	});
});
