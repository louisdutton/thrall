import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { launch, type Page } from "./index";

describe("thrall", () => {
	let page: Page;

	beforeAll(async () => {
		page = await launch();
	}, 15000);

	afterAll(async () => {
		await page.close();
	});

	test("navigates to a page", async () => {
		await page.goto("https://example.com");
		const title = await page.title();
		expect(title).toBe("Example Domain");
	});

	test("gets page content", async () => {
		const content = await page.content();
		expect(content).toContain("Example Domain");
	});

	test("gets current URL", async () => {
		const url = await page.url();
		expect(url).toBe("https://example.com/");
	});

	test("finds elements", async () => {
		const heading = await page.$("h1");
		expect(heading).not.toBeNull();

		const text = await heading!.textContent();
		expect(text).toBe("Example Domain");
	});

	test("finds multiple elements", async () => {
		const paragraphs = await page.$$("p");
		expect(paragraphs.length).toBeGreaterThan(0);
	});

	test("evaluates JavaScript", async () => {
		const result = await page.evaluate(() => {
			return document.querySelectorAll("p").length;
		});
		expect(result).toBeGreaterThan(0);
	});

	test("evaluates with arguments", async () => {
		const result = await page.evaluate((a: number, b: number) => a + b, 2, 3);
		expect(result).toBe(5);
	});

	test("takes screenshots", async () => {
		const buffer = await page.screenshot();
		expect(buffer.length).toBeGreaterThan(0);
		expect(buffer[0]).toBe(0x89); // PNG magic number
		expect(buffer[1]).toBe(0x50);
	});

	test("waits for selector", async () => {
		const element = await page.waitForSelector("h1");
		expect(element).not.toBeNull();
	});

	test("gets element attributes", async () => {
		const link = await page.$("a");
		expect(link).not.toBeNull();
		const href = await link!.getAttribute("href");
		expect(href).toContain("iana.org");
	});

	test("checks element visibility", async () => {
		const heading = await page.$("h1");
		expect(heading).not.toBeNull();
		const visible = await heading!.isVisible();
		expect(visible).toBe(true);
	});

	test("getByText finds element by partial text", async () => {
		const element = await page.getByText("Example");
		const text = await element.textContent();
		expect(text).toContain("Example");
	});

	test("getByText finds element by exact text", async () => {
		const element = await page.getByText("Example Domain", { exact: true });
		expect(element).toBeDefined();
	});

	test("getByText throws for non-existent text", async () => {
		await expect(
			page.getByText("This text does not exist anywhere", { timeout: 100 }),
		).rejects.toThrow("Unable to find element with text");
	});

	test("getAllByText finds multiple elements", async () => {
		const elements = await page.getAllByText("Domain");
		expect(elements.length).toBeGreaterThan(0);
	});

	test("getByRole finds button/link elements", async () => {
		const link = await page.getByRole("link");
		const href = await link.getAttribute("href");
		expect(href).toContain("iana.org");
	});

	test("getByRole with name filter", async () => {
		const link = await page.getByRole("link", { name: "Learn more" });
		expect(link).toBeDefined();
	});

	test("getByRole throws for non-matching name", async () => {
		await expect(
			page.getByRole("link", { name: "Nonexistent Link", timeout: 100 }),
		).rejects.toThrow('Unable to find element with role "link"');
	});

	test("getByText handles text with spaces", async () => {
		const element = await page.getByText("Example Domain");
		const text = await element.textContent();
		expect(text).toBe("Example Domain");
	});

	test("getByText handles partial match with spaces", async () => {
		const element = await page.getByText("ample Dom");
		expect(element).toBeDefined();
	});

	test("getByText auto-waits for element to appear", async () => {
		page.evaluate(() => {
			setTimeout(() => {
				const span = document.createElement("span");
				span.textContent = "Delayed Text Content";
				document.body.appendChild(span);
			}, 200);
		});

		const start = Date.now();
		const element = await page.getByText("Delayed Text Content", {
			timeout: 5000,
		});
		const elapsed = Date.now() - start;

		expect(element).toBeDefined();
		expect(elapsed).toBeGreaterThanOrEqual(150);
	});

	test("humanType types text character by character", async () => {
		await page.evaluate(() => {
			const ta = document.createElement("textarea");
			ta.id = "human-type-test";
			document.body.appendChild(ta);
		});

		await page.humanType("#human-type-test", "Hello World", { delay: 10 });

		const value = await page.evaluate(() => {
			const ta = document.querySelector("#human-type-test") as HTMLTextAreaElement;
			return ta.value;
		});
		expect(value).toBe("Hello World");

		await page.evaluate(() => {
			document.querySelector("#human-type-test")?.remove();
		});
	});

	test("humanType dispatches input events for each character", async () => {
		await page.evaluate(() => {
			const ta = document.createElement("textarea");
			ta.id = "human-type-events";
			(window as any).__inputCount = 0;
			ta.addEventListener("input", () => {
				(window as any).__inputCount++;
			});
			document.body.appendChild(ta);
		});

		await page.humanType("#human-type-events", "ABCDE", { delay: 10 });

		const inputCount = await page.evaluate(() => (window as any).__inputCount);
		expect(inputCount).toBe(5);

		await page.evaluate(() => {
			document.querySelector("#human-type-events")?.remove();
			delete (window as any).__inputCount;
		});
	});

	test("humanType takes approximately delay * length ms", async () => {
		await page.evaluate(() => {
			const ta = document.createElement("textarea");
			ta.id = "human-type-timing";
			document.body.appendChild(ta);
		});

		const start = Date.now();
		await page.humanType("#human-type-timing", "12345", { delay: 50 });
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(200);

		await page.evaluate(() => {
			document.querySelector("#human-type-timing")?.remove();
		});
	});

	test("smoothWheel scrolls over duration", async () => {
		await page.evaluate(() => {
			const div = document.createElement("div");
			div.id = "wheel-test";
			div.style.cssText = "width:200px;height:100px;overflow:auto;";
			div.innerHTML = '<div style="height:1000px">tall content</div>';
			document.body.appendChild(div);
		});

		const el = await page.waitForSelector("#wheel-test", { visible: true });
		const box = await el.boundingBox();
		expect(box).not.toBeNull();
		await page.mouseMove(box!.x + 100, box!.y + 50);

		const start = Date.now();
		await page.smoothWheel(300, { duration: 500 });
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(400);

		const scrollTop = await page.evaluate(() => {
			return document.querySelector("#wheel-test")!.scrollTop;
		});
		expect(scrollTop).toBeGreaterThan(0);

		await page.evaluate(() => {
			document.querySelector("#wheel-test")?.remove();
		});
	});

	test("smoothScroll scrolls within element", async () => {
		await page.evaluate(() => {
			const div = document.createElement("div");
			div.id = "scroll-test";
			div.style.cssText = "width:200px;height:100px;overflow:auto;";
			div.innerHTML = '<div style="height:1000px">tall content</div>';
			document.body.appendChild(div);
		});

		await page.smoothScroll("#scroll-test", 200, { duration: 300 });

		const scrollTop = await page.evaluate(() => {
			return document.querySelector("#scroll-test")!.scrollTop;
		});
		expect(scrollTop).toBeGreaterThan(0);

		await page.evaluate(() => {
			document.querySelector("#scroll-test")?.remove();
		});
	});

	test("getByRole auto-waits for element to appear", async () => {
		page.evaluate(() => {
			setTimeout(() => {
				const btn = document.createElement("button");
				btn.textContent = "Delayed Button";
				document.body.appendChild(btn);
			}, 200);
		});

		const start = Date.now();
		const element = await page.getByRole("button", {
			name: "Delayed Button",
			timeout: 5000,
		});
		const elapsed = Date.now() - start;

		expect(element).toBeDefined();
		expect(elapsed).toBeGreaterThanOrEqual(150);
	});

	// -------------------------------------------------------------------------
	// Navigation
	// -------------------------------------------------------------------------

	test("reload reloads the current page", async () => {
		await page.goto("https://example.com");
		const contentBefore = await page.content();
		expect(contentBefore).toContain("Example Domain");

		await page.reload();
		const contentAfter = await page.content();
		// After reload, page content is still available
		expect(contentAfter).toContain("Example Domain");

		// Ensure WebView is fully settled
		await Bun.sleep(200);
	});

	test("goBack and goForward navigate history", async () => {
		// Use pushState for reliable, non-network history
		await page.goto("https://example.com");
		await Bun.sleep(200);

		await page.evaluate(() => {
			window.history.pushState({}, "", "/page-two");
		});
		await Bun.sleep(100);

		// view.url may not reflect pushState changes; check via JS
		const jsUrl = await page.evaluate(() => window.location.href);
		expect(jsUrl).toContain("/page-two");

		await page.evaluate(() => { window.history.back(); });
		await Bun.sleep(200);
		const urlBack = await page.evaluate(() => window.location.href);
		expect(urlBack).not.toContain("/page-two");

		await page.evaluate(() => { window.history.forward(); });
		await Bun.sleep(200);
		const urlForward = await page.evaluate(() => window.location.href);
		expect(urlForward).toContain("/page-two");
	});

	test("waitForURL with string", async () => {
		await page.goto("https://example.com");
		await page.waitForURL("https://example.com/", { timeout: 5000 });
		expect(await page.url()).toBe("https://example.com/");
	});

	test("waitForURL with regex", async () => {
		await page.waitForURL(/example\.com/, { timeout: 5000 });
		expect(await page.url()).toContain("example.com");
	});

	test("waitForURL with predicate", async () => {
		await page.waitForURL((u) => u.includes("example"), { timeout: 5000 });
		expect(await page.url()).toContain("example");
	});

	test("waitForURL times out for non-matching URL", async () => {
		await page.goto("https://example.com");
		await expect(
			page.waitForURL("https://nonexistent.invalid/", { timeout: 100 }),
		).rejects.toThrow("Timeout waiting for URL");
	});

	// -------------------------------------------------------------------------
	// Semantic selectors
	// -------------------------------------------------------------------------

	test("getByLabel finds input by label text", async () => {
		await page.goto("https://example.com");
		await page.evaluate(() => {
			document.body.innerHTML = `
				<label for="email-input">Email Address</label>
				<input id="email-input" type="email" />
			`;
		});

		const input = await page.getByLabel("Email Address");
		expect(input).toBeDefined();
		await input.fill("test@example.com");
		const value = await input.inputValue();
		expect(value).toBe("test@example.com");
	});

	test("getByLabel finds input by aria-label", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input aria-label="Search" type="text" />`;
		});

		const input = await page.getByLabel("Search");
		expect(input).toBeDefined();
	});

	test("getByLabel finds wrapped input", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<label>Username <input type="text" /></label>
			`;
		});

		const input = await page.getByLabel("Username");
		expect(input).toBeDefined();
	});

	test("getByPlaceholder finds input by placeholder", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input placeholder="Enter your name" />`;
		});

		const input = await page.getByPlaceholder("Enter your name");
		expect(input).toBeDefined();
	});

	test("getByPlaceholder partial match", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input placeholder="Enter your name" />`;
		});

		const input = await page.getByPlaceholder("your name");
		expect(input).toBeDefined();
	});

	test("getByTestId finds element by data-testid", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<button data-testid="submit-btn">Submit</button>`;
		});

		const btn = await page.getByTestId("submit-btn");
		expect(btn).toBeDefined();
		const text = await btn.textContent();
		expect(text).toBe("Submit");
	});

	// -------------------------------------------------------------------------
	// Interaction: click, type, fill with auto-wait
	// -------------------------------------------------------------------------

	test("click auto-waits for element", async () => {
		await page.goto("https://example.com");
		await page.evaluate(() => {
			(window as any).__clicked = false;
			setTimeout(() => {
				const btn = document.createElement("button");
				btn.id = "delayed-btn";
				btn.onclick = () => { (window as any).__clicked = true; };
				document.body.appendChild(btn);
			}, 200);
		});

		await page.click("#delayed-btn");
		const clicked = await page.evaluate(() => (window as any).__clicked);
		expect(clicked).toBe(true);
	});

	test("type auto-waits and types into input", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="type-test" type="text" />`;
		});

		await page.type("#type-test", "hello");
		const value = await page.evaluate(
			() => (document.querySelector("#type-test") as HTMLInputElement).value,
		);
		expect(value).toBe("hello");
	});

	test("fill auto-waits and fills input", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="fill-test" type="text" value="old" />`;
		});

		await page.fill("#fill-test", "new value");
		const value = await page.evaluate(
			() => (document.querySelector("#fill-test") as HTMLInputElement).value,
		);
		expect(value).toBe("new value");
	});

	test("waitForFunction resolves when condition is true", async () => {
		await page.evaluate(() => {
			(window as any).__ready = false;
			setTimeout(() => { (window as any).__ready = true; }, 200);
		});

		const result = await page.waitForFunction(
			() => (window as any).__ready,
			{ timeout: 5000 },
		);
		expect(result).toBe(true);
	});

	test("waitForFunction times out", async () => {
		await expect(
			page.waitForFunction(() => false, { timeout: 100 }),
		).rejects.toThrow("Timeout waiting for function");
	});

	// -------------------------------------------------------------------------
	// Keyboard
	// -------------------------------------------------------------------------

	test("press sends key to focused element", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="press-test" type="text" />`;
		});

		await page.click("#press-test");
		await page.press("Enter");

		const enterPressed = await page.evaluate(() => {
			const el = document.querySelector("#press-test") as HTMLInputElement;
			// Enter in an input doesn't add a char, so verify it was focused and functional
			return document.activeElement === el;
		});
		expect(enterPressed).toBe(true);
	});

	test("typeText types full text", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="typetext-test" type="text" />`;
		});

		await page.click("#typetext-test");
		await page.typeText("hello world");
		const value = await page.evaluate(
			() => (document.querySelector("#typetext-test") as HTMLInputElement).value,
		);
		expect(value).toBe("hello world");
	});

	test("typeText with delay types slowly", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="typetext-delay" type="text" />`;
		});

		await page.click("#typetext-delay");
		const start = Date.now();
		await page.typeText("abc", { delay: 50 });
		const elapsed = Date.now() - start;
		expect(elapsed).toBeGreaterThanOrEqual(100);

		const value = await page.evaluate(
			() => (document.querySelector("#typetext-delay") as HTMLInputElement).value,
		);
		expect(value).toBe("abc");
	});

	test("keyDown and keyUp dispatch events", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="keydown-test" type="text" />`;
			const el = document.querySelector("#keydown-test") as HTMLInputElement;
			(window as any).__keyEvents = [];
			el.addEventListener("keydown", (e) => (window as any).__keyEvents.push("down:" + e.key));
			el.addEventListener("keyup", (e) => (window as any).__keyEvents.push("up:" + e.key));
		});

		await page.click("#keydown-test");

		await page.keyDown("Shift");
		await page.keyUp("Shift");

		const events = await page.evaluate(() => (window as any).__keyEvents);
		expect(events).toContain("down:Shift");
		expect(events).toContain("up:Shift");
	});

	// -------------------------------------------------------------------------
	// Mouse
	// -------------------------------------------------------------------------

	test("mouseClick dispatches mouse events at coordinates", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<div id="click-target" style="width:200px;height:200px;position:absolute;top:0;left:0;"></div>
			`;
			(window as any).__mouseClicked = false;
			document.querySelector("#click-target")!.addEventListener("mouseup", () => {
				(window as any).__mouseClicked = true;
			});
		});

		await page.mouseClick(100, 100);
		const clicked = await page.evaluate(() => (window as any).__mouseClicked);
		expect(clicked).toBe(true);
	});

	test("mouseMove updates mouse position", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<div id="move-target" style="width:400px;height:400px;position:absolute;top:0;left:0;"></div>
			`;
			(window as any).__lastMoveX = 0;
			document.querySelector("#move-target")!.addEventListener("mousemove", (e: Event) => {
				(window as any).__lastMoveX = (e as MouseEvent).clientX;
			});
		});

		await page.mouseMove(250, 100);
		const x = await page.evaluate(() => (window as any).__lastMoveX);
		expect(x).toBeCloseTo(250, 0);
	});

	test("dblclick dispatches double-click event", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<div id="dbl-target" style="width:200px;height:200px;position:absolute;top:0;left:0;"></div>
			`;
			(window as any).__dblDetail = 0;
			document.querySelector("#dbl-target")!.addEventListener("mouseup", (e: Event) => {
				(window as any).__dblDetail = (e as MouseEvent).detail;
			});
		});

		await page.dblclick(100, 100);
		const detail = await page.evaluate(() => (window as any).__dblDetail);
		expect(detail).toBe(2);
	});

	test("wheel dispatches wheel event", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<div id="wheel-target" style="width:400px;height:400px;position:absolute;top:0;left:0;"></div>
			`;
			(window as any).__wheelDelta = 0;
			document.querySelector("#wheel-target")!.addEventListener("wheel", (e: Event) => {
				(window as any).__wheelDelta = (e as WheelEvent).deltaY;
			});
		});

		await page.mouseMove(200, 200);
		await page.wheel({ deltaY: 100 });
		const delta = await page.evaluate(() => (window as any).__wheelDelta);
		expect(delta).toBe(100);
	});

	test("scroll scrolls within an element", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<div id="scroll-el" style="width:200px;height:100px;overflow:auto;">
					<div style="height:1000px;">tall</div>
				</div>
			`;
		});

		await page.scroll("#scroll-el", 150);
		const scrollTop = await page.evaluate(
			() => document.querySelector("#scroll-el")!.scrollTop,
		);
		expect(scrollTop).toBe(150);
	});

	// -------------------------------------------------------------------------
	// Cookies
	// -------------------------------------------------------------------------

	test("setCookie and cookies round-trip", async () => {
		await page.goto("https://example.com");
		await page.setCookie({ name: "test_cookie", value: "abc123" });

		const cookies = await page.cookies();
		const found = cookies.find((c) => c.name === "test_cookie");
		expect(found).toBeDefined();
		expect(found!.value).toBe("abc123");
	});

	test("deleteCookie removes cookie", async () => {
		await page.goto("https://example.com");
		await page.setCookie({ name: "to_delete", value: "bye" });

		let cookies = await page.cookies();
		expect(cookies.find((c) => c.name === "to_delete")).toBeDefined();

		await page.deleteCookie("to_delete");

		cookies = await page.cookies();
		expect(cookies.find((c) => c.name === "to_delete")).toBeUndefined();
	});

	// -------------------------------------------------------------------------
	// Viewport & screenshot options
	// -------------------------------------------------------------------------

	test("setViewport changes viewport size", async () => {
		await page.setViewport(800, 600);

		const dims = await page.evaluate(() => ({
			w: window.innerWidth,
			h: window.innerHeight,
		}));
		expect(dims.w).toBe(800);
		expect(dims.h).toBe(600);

		// Reset
		await page.setViewport(1280, 720);
	});

	test("defaultTimeout getter and setter", () => {
		const original = page.defaultTimeout;
		expect(original).toBe(30000);

		page.defaultTimeout = 5000;
		expect(page.defaultTimeout).toBe(5000);

		page.defaultTimeout = original;
	});

	test("screenshot with jpeg format", async () => {
		await page.goto("https://example.com");
		const buffer = await page.screenshot({ type: "jpeg", quality: 50 });
		expect(buffer.length).toBeGreaterThan(0);
		// JPEG magic: FF D8
		expect(buffer[0]).toBe(0xFF);
		expect(buffer[1]).toBe(0xD8);
	});

	test("screenshot saves to path", async () => {
		const path = `/tmp/thrall-screenshot-test-${Date.now()}.png`;
		await page.goto("https://example.com");
		await page.screenshot({ path });

		const file = Bun.file(path);
		expect(await file.exists()).toBe(true);
		expect(file.size).toBeGreaterThan(0);
		await Bun.$`rm -f ${path}`;
	});

	// -------------------------------------------------------------------------
	// ElementHandle
	// -------------------------------------------------------------------------

	test("element.click() clicks the element", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<button id="el-click">Click Me</button>`;
			(window as any).__elClicked = false;
			document.querySelector("#el-click")!.addEventListener("click", () => {
				(window as any).__elClicked = true;
			});
		});

		const btn = await page.waitForSelector("#el-click");
		await btn.click();
		const clicked = await page.evaluate(() => (window as any).__elClicked);
		expect(clicked).toBe(true);
	});

	test("element.type() types into element", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="el-type" type="text" />`;
		});

		const input = await page.waitForSelector("#el-type");
		await input.type("typed text");
		const value = await input.inputValue();
		expect(value).toBe("typed text");
	});

	test("element.fill() sets input value", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="el-fill" type="text" value="old" />`;
		});

		const input = await page.waitForSelector("#el-fill");
		await input.fill("filled value");
		const value = await input.inputValue();
		expect(value).toBe("filled value");
	});

	test("element.humanType() types with events", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<textarea id="el-human"></textarea>`;
			(window as any).__inputEvents = 0;
			document.querySelector("#el-human")!.addEventListener("input", () => {
				(window as any).__inputEvents++;
			});
		});

		const ta = await page.waitForSelector("#el-human");
		await ta.humanType("abc", { delay: 10 });

		const value = await ta.inputValue();
		expect(value).toBe("abc");
		const events = await page.evaluate(() => (window as any).__inputEvents);
		expect(events).toBe(3);
	});

	test("element.focus() focuses the element", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="el-focus" type="text" />`;
		});

		const input = await page.waitForSelector("#el-focus");
		await input.focus();
		const isFocused = await page.evaluate(
			() => document.activeElement?.id === "el-focus",
		);
		expect(isFocused).toBe(true);
	});

	test("element.hover() dispatches hover events", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<div id="el-hover" style="width:100px;height:100px;">Hover</div>`;
			(window as any).__hovered = false;
			document.querySelector("#el-hover")!.addEventListener("mouseover", () => {
				(window as any).__hovered = true;
			});
		});

		const el = await page.waitForSelector("#el-hover");
		await el.hover();
		const hovered = await page.evaluate(() => (window as any).__hovered);
		expect(hovered).toBe(true);
	});

	test("element.innerText() returns inner text", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<div id="el-innertext">Hello <span>World</span></div>`;
		});

		const el = await page.waitForSelector("#el-innertext");
		const text = await el.innerText();
		expect(text).toBe("Hello World");
	});

	test("element.innerHTML() returns inner HTML", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<div id="el-innerhtml">Hello <span>World</span></div>`;
		});

		const el = await page.waitForSelector("#el-innerhtml");
		const html = await el.innerHTML();
		expect(html).toBe("Hello <span>World</span>");
	});

	test("element.isChecked() returns checkbox state", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<input id="cb" type="checkbox" />
				<input id="cb-checked" type="checkbox" checked />
			`;
		});

		const cb = await page.waitForSelector("#cb");
		expect(await cb.isChecked()).toBe(false);

		const cbChecked = await page.waitForSelector("#cb-checked");
		expect(await cbChecked.isChecked()).toBe(true);
	});

	test("element.check() and uncheck() toggle checkbox", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<input id="cb-toggle" type="checkbox" />`;
		});

		const cb = await page.waitForSelector("#cb-toggle");
		expect(await cb.isChecked()).toBe(false);

		await cb.check();
		expect(await cb.isChecked()).toBe(true);

		// check() is idempotent
		await cb.check();
		expect(await cb.isChecked()).toBe(true);

		await cb.uncheck();
		expect(await cb.isChecked()).toBe(false);

		// uncheck() is idempotent
		await cb.uncheck();
		expect(await cb.isChecked()).toBe(false);
	});

	test("element.isDisabled() returns disabled state", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<input id="enabled-input" type="text" />
				<input id="disabled-input" type="text" disabled />
			`;
		});

		const enabled = await page.waitForSelector("#enabled-input");
		expect(await enabled.isDisabled()).toBe(false);

		const disabled = await page.waitForSelector("#disabled-input");
		expect(await disabled.isDisabled()).toBe(true);
	});

	test("element.isEditable() returns editable state", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<input id="editable" type="text" />
				<input id="readonly" type="text" readonly />
				<div id="not-editable">text</div>
			`;
		});

		const editable = await page.waitForSelector("#editable");
		expect(await editable.isEditable()).toBe(true);

		const readonly = await page.waitForSelector("#readonly");
		expect(await readonly.isEditable()).toBe(false);

		const div = await page.waitForSelector("#not-editable");
		expect(await div.isEditable()).toBe(false);
	});

	test("element.selectOption() selects by value", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<select id="sel">
					<option value="a">Option A</option>
					<option value="b">Option B</option>
					<option value="c">Option C</option>
				</select>
			`;
		});

		const sel = await page.waitForSelector("#sel");
		await sel.selectOption("b");
		const value = await sel.inputValue();
		expect(value).toBe("b");
	});

	test("element.selectOption() selects by label", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `
				<select id="sel-label">
					<option value="x">First</option>
					<option value="y">Second</option>
				</select>
			`;
		});

		const sel = await page.waitForSelector("#sel-label");
		await sel.selectOption({ label: "Second" });
		const value = await sel.inputValue();
		expect(value).toBe("y");
	});

	test("element.screenshot() captures element screenshot", async () => {
		await page.evaluate(() => {
			document.body.innerHTML = `<div id="el-screenshot" style="width:100px;height:100px;background:red;"></div>`;
		});

		const el = await page.waitForSelector("#el-screenshot");
		const buffer = await el.screenshot();
		expect(buffer.length).toBeGreaterThan(0);
		expect(buffer[0]).toBe(0x89); // PNG
	});
});
