# thrall

Lightweight Chromium automation for Bun via CDP.

- **Fast** - No heavy browser binaries, uses your installed Chromium
- **Simple** - Familiar API, works with `bun test` out of the box
- **Minimal** - ~70KB, zero dependencies beyond Bun

## Install

```bash
bun add github:louisdutton/thrall
```

## Quick Start

```ts
import { launch } from "thrall";

const browser = await launch();
const page = await browser.newPage();

await page.goto("https://example.com");
console.log(await page.title());

await browser.close();
```

## Testing

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { launch, type Browser, type Page } from "thrall";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

test("page title", async () => {
  await page.goto("https://example.com");
  expect(await page.title()).toBe("Example Domain");
});
```

## Examples

### Screenshots

```ts
await page.screenshot({ path: "page.png" });
await page.screenshot({ fullPage: true, path: "full.png" });

const element = await page.$("h1");
await element.screenshot({ path: "heading.png" });
```

### Form Interaction

```ts
await page.fill("input[name=email]", "user@example.com");
await page.fill("input[name=password]", "secret");
await page.click("button[type=submit]");

await page.waitForNavigation();
```

### Evaluate JavaScript

```ts
const count = await page.evaluate(() => document.querySelectorAll("a").length);

const text = await page.evaluate((sel) => {
  return document.querySelector(sel)?.textContent;
}, "h1");
```

### Wait for Network

```ts
const [response] = await Promise.all([
  page.waitForResponse("/api/data"),
  page.click("button.load"),
]);

console.log(response.status);
```

### Keyboard & Mouse

```ts
await page.keyboard.type("Hello World");
await page.keyboard.press("Enter");

await page.mouse.click(100, 200);
await page.mouse.wheel({ deltaY: 500 });
```

### Cookies

```ts
await page.setCookie({
  name: "session",
  value: "abc123",
  domain: "example.com",
});

const cookies = await page.cookies();
await page.deleteCookie("session");
```

### Geolocation

```ts
await page.setGeolocation({
  latitude: 37.7749,
  longitude: -122.4194,
});
```

### Find by Text / Role

```ts
const signIn = await page.getByText("Sign In");
await signIn?.click();

const submitBtn = await page.getByRole("button", { name: "Submit" });
await submitBtn?.click();
```

## API

### launch(options?)

```ts
const browser = await launch({
  headless: true,           // default: true
  executablePath: "/path",  // auto-detected
  args: [],                 // additional Chrome flags
});
```

### Browser

| Method | Description |
|--------|-------------|
| `newPage()` | Create a new page |
| `pages()` | Get all pages |
| `close()` | Close browser |

### Page

| Method | Description |
|--------|-------------|
| `goto(url, options?)` | Navigate to URL |
| `reload()` | Reload page |
| `goBack()` | Navigate back |
| `goForward()` | Navigate forward |
| `content()` | Get HTML |
| `title()` | Get title |
| `url()` | Get URL |
| `$(selector)` | Query element |
| `$$(selector)` | Query all elements |
| `getByText(text, options?)` | Find by text content |
| `getAllByText(text, options?)` | Find all by text |
| `getByRole(role, options?)` | Find by ARIA role |
| `click(selector)` | Click element |
| `type(selector, text)` | Type text |
| `fill(selector, value)` | Fill input |
| `waitForSelector(selector, options?)` | Wait for element |
| `waitForNavigation(options?)` | Wait for navigation |
| `waitForFunction(fn, options?)` | Wait for condition |
| `waitForRequest(url)` | Wait for request |
| `waitForResponse(url)` | Wait for response |
| `evaluate(fn, ...args)` | Run JS in page |
| `screenshot(options?)` | Capture screenshot |
| `pdf(options?)` | Generate PDF |
| `setViewport(width, height)` | Set viewport |
| `setGeolocation(coords)` | Override geolocation |
| `setCookie(...cookies)` | Set cookies |
| `cookies(urls?)` | Get cookies |
| `deleteCookie(name, url?)` | Delete cookie |
| `keyboard` | Keyboard input |
| `mouse` | Mouse input |
| `close()` | Close page |

### ElementHandle

| Method | Description |
|--------|-------------|
| `click()` | Click |
| `type(text)` | Type text |
| `fill(value)` | Set value |
| `focus()` | Focus |
| `hover()` | Hover |
| `textContent()` | Get text |
| `innerText()` | Get inner text |
| `innerHTML()` | Get HTML |
| `getAttribute(name)` | Get attribute |
| `isVisible()` | Check visibility |
| `boundingBox()` | Get bounds |
| `screenshot(options?)` | Screenshot |

### Keyboard

| Method | Description |
|--------|-------------|
| `type(text, options?)` | Type text |
| `press(key)` | Press key |
| `down(key)` | Key down |
| `up(key)` | Key up |

### Mouse

| Method | Description |
|--------|-------------|
| `click(x, y, options?)` | Click |
| `dblclick(x, y, options?)` | Double click |
| `move(x, y, options?)` | Move |
| `down(options?)` | Button down |
| `up(options?)` | Button up |
| `wheel(options?)` | Scroll |

## MCP Server

Thrall includes an MCP server for AI assistant integration.

### Install

```nix
inputs.thrall.url = "github:louisdutton/thrall";

# Add overlay, then use:
pkgs.thrall-mcp
```

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thrall": {
      "command": "thrall-mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `launch` | Launch browser |
| `close` | Close browser |
| `navigate` | Go to URL |
| `click` | Click element |
| `type` | Type into element |
| `fill` | Fill input field |
| `screenshot` | Take screenshot (returns base64) |
| `get_content` | Get page HTML |
| `get_title` | Get page title |
| `get_url` | Get current URL |
| `get_text` | Get element text |
| `evaluate` | Run JavaScript |
| `wait_for_selector` | Wait for element |
| `reload` | Reload page |
| `go_back` | Navigate back |
| `go_forward` | Navigate forward |
| `set_geolocation` | Override geolocation |
| `get_by_text` | Find element by text |
| `get_by_role` | Find element by role |

## License

GPL-3.0
