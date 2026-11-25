---
title: "What Is a User Agent? How to Check It and Keep It Consistent in Browser Profiles"
description: What is a user agent? Learn how the user agent string works, how to check yours step by step and how to keep it consistent across browser profiles.
seoTitle: What Is a User Agent? How to Check and Match It
author: Oscar Odero
date: 2026-11-25
---
Every request your browser sends to a website starts with a short line of text that says who is asking. That line is the user agent. It looks cryptic, yet it shapes how sites serve pages and it is one of the first details a profile has to get right. This guide explains what a user agent is, how to read one, how to check it and how to keep it consistent across browser profiles.

## What is a user agent? The short answer

**A user agent is the software making a web request, and the user agent string is the line of text it sends to describe itself, including the browser, its version and the operating system.** Browsers send it in the HTTP `User-Agent` request header, and scripts can read the same value with `navigator.userAgent`.

MDN describes the [User-Agent header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent) as a characteristic string that lets servers and network peers identify the application, operating system, vendor or version behind a request. Sites use it to serve the right layout and filter out automated traffic.

## What a user agent string looks like

Most browser strings start with `Mozilla/5.0`. MDN notes this is a historical compatibility token that almost every browser still sends, so it tells you nothing on its own. The useful parts come after it.

| Browser | Typical pattern | What it reveals |
|---|---|---|
| Firefox | `Mozilla/5.0 (platform; rv:version) Gecko/20100101 Firefox/version` | Operating system, Gecko engine, Firefox version |
| Chrome on Windows | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36` | Windows, 64-bit, Chrome major version |
| Chrome on Android | `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36` | Android, mobile device |

Chromium-based browsers add `like Gecko` and `Safari` for compatibility, and a mobile string includes the word `Mobile`, as MDN documents.

## Why user agent strings are being reduced

The string reveals enough detail to help identify a browser, which is why privacy teams treat it as a fingerprinting signal. MDN explains that supporting browsers now send a reduced set of information in the `User-Agent` header and in related values such as `navigator.userAgent` and `navigator.platform`.

In practice, Chrome shows its major version but writes the minor numbers as zeros, which is why you see `143.0.0.0`. On Android it uses a fixed platform version and a placeholder device model. MDN's guide to [user-agent reduction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction) covers the details.

Sites that need more detail ask for it through [Client Hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Client_hints). The server sends an `Accept-CH` header, and the browser can reply with `Sec-CH-UA` headers. The takeaway is that the string is no longer the whole story, so a profile has to be consistent in more than one place.

## How to check your user agent

Check it inside the exact profile you plan to use:

1. Open the browser or profile you want to test.
2. Open developer tools and go to the Console.
3. Type `navigator.userAgent` and press Enter to read the string.
4. In Chrome or Edge, type `navigator.userAgentData` to see the brands, platform and mobile flag that Client Hints expose.
5. Open the Network tab, select any request and read the `User-Agent` and `Sec-CH-UA` request headers. They should agree with the console values.
6. Run a fingerprint test page and compare the results with what you expect.

Our step-by-step guide to [checking your browser fingerprint](/blog/how-to-check-your-browser-fingerprint) shows how to record and compare these results. If you are new to the wider topic, start with [what browser fingerprinting is](/blog/what-is-browser-fingerprinting).

## Why the user agent must agree with the rest of the profile

A website can compare the user agent with other values your browser reports, and disagreement is easy to spot.

| The user agent says | The rest of the profile shows | Why it is a problem |
|---|---|---|
| Firefox | Chromium-only features and Client Hints | The claimed browser and the real engine differ |
| Windows | A macOS platform value | The operating system is contradicted |
| Mobile phone | A wide desktop screen | The device type is contradicted |
| An old browser version | Features only newer versions have | The claimed version is implausible |
| English only | A different language preference | The signals tell two stories |

## Should you change your user agent?

**Usually not, unless you have a clear reason.** The default string from the browser you actually run is already consistent with its engine, platform and features. Changing only the text, for example with a simple extension, edits one header while the other signals stay the same, and that creates the mismatches in the table above.

If you do need a different identity, change related values together: the user agent, platform, Client Hints, language and screen size. Then test the result. Our guide to [running multiple accounts separately](/blog/run-multiple-accounts-separately-guide) shows where this fits, and the [proxy review checklist](/blog/proxy-controls-for-separate-sessions-review-checklist) covers the network side.

## A user agent consistency checklist

- Record the user agent and platform for every profile
- Confirm the browser name and version match the browser the profile launches
- Check that Client Hints agree with the string in Chrome-based profiles
- Match the device type to the screen size and the platform value
- Retest after every update or settings change

## Common user agent problems and fixes

- **The console and the headers disagree.** A value was changed in one place only. Reapply the profile settings and test again.
- **A site shows the mobile layout on desktop.** The string says mobile. Switch to a desktop preset and reload.
- **Results changed after an update.** Browser updates can alter reduced values. Retest and record the new baseline.

## How VertexStealth handles user agents

[VertexStealth](/antidetect-browser) launches your installed Chrome or Firefox with a separate profile folder and lets you configure the user agent, platform, Client Hints and browser language for each profile, alongside its own proxy. Windows and mobile presets give you a coherent starting point. See the [multi-profile management page](/multi-profile-management) and the [features list](/features) for what each profile can control. No setup guarantees how a website will treat a session, so test every profile before you rely on it.

## Frequently asked questions

### What is a user agent in simple terms?

It is a short piece of text your browser sends with each request to say which browser, version and operating system it is.

### Is the user agent the same as a fingerprint?

No. The user agent is one signal. A fingerprint combines many signals, such as screen size, fonts and graphics behavior.

### How do I find my user agent?

Open developer tools, use the Console and type `navigator.userAgent`. You can also read the `User-Agent` header in the Network tab.

### Why does my Chrome version end in .0.0.0?

Chrome reduces the minor version numbers in the string for privacy. Only the major version is shown in full.

### Is changing the user agent enough to look like a different browser?

No. Other signals, such as the engine, platform and Client Hints, must agree with it, or the mismatch can stand out.

## Use profiles responsibly

Separate profiles are tools for organizing legitimate work. Follow each platform's terms and our [acceptable use policy](/acceptable-use).

Ready to set up your profiles? Visit the [VertexStealth homepage](/) or see [how it works](/how-it-works).

## Sources and further reading

- [User-Agent header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent), MDN Web Docs.
- [User-agent reduction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/User-agent_reduction), MDN Web Docs.
- [Client hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Client_hints), MDN Web Docs.
