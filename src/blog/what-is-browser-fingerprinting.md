---
title: What Is Browser Fingerprinting? How It Works and How to Check Yours
description: Browser fingerprinting identifies a browser without cookies. See which signals it uses, why sites rely on it, how to test yours and what really reduces it.
seoTitle: What Is Browser Fingerprinting? How to Check Yours
date: 2026-10-31
---
Every time you open a website, your browser tells it a surprising amount about itself: which browser and version you run, your language, your screen size, your timezone and more. Individually these details are boring. Combined, they can form a pattern distinctive enough to recognize a browser the next time it shows up, even if you have cleared your cookies. That pattern is called a **browser fingerprint**, and this guide explains how it is built, why websites use it, how to test yours and what realistically changes it.

## What is browser fingerprinting?

Browser fingerprinting is the practice of collecting many small characteristics of a browser and its device, then combining them into an identifier. The idea is simple: very few browsers share exactly the same combination of version, operating system, fonts, screen, language, hardware and graphics behavior.

The Electronic Frontier Foundation (EFF) built its [Panopticlick experiment, now called Cover Your Tracks](https://coveryourtracks.eff.org/), specifically to test whether the characteristics a browser reveals, viewed together, can work as a unique identifier that follows someone around the web. EFF describes the effect with an analogy: browsers leave traces of identifiable information the way animals leave tracks in the wild.

A fingerprint is not a stored file. Nothing is saved on your computer. The signals are read live from the state of your hardware and software, which is exactly why clearing cookies does not remove it.

## Fingerprinting vs. cookies

| | Cookies | Fingerprinting |
|---|---|---|
| Stored on your device | Yes | No, it is read from your browser each visit |
| You can delete it | Yes, in browser settings | No single place to delete it |
| Visible in browser settings | Yes | No |
| Affected by incognito mode | Cleared when the session ends | Largely unaffected |
| Affected by changing your IP | No | Only the network part changes |

Cookies are an explicit, deletable record. A fingerprint is an inference: a site compares what your browser reports now with what it has seen before. That makes it harder for ordinary users to notice and control. If you want to see how a private window compares, read our guide on [antidetect browsers, VPNs and incognito mode](/blog/antidetect-browser-vs-vpn-vs-incognito-mode).

## The signals that make up a fingerprint

Fingerprints are assembled from many sources. The most common groups are:

- **Navigator values:** user agent, browser version, platform, language list and "Do Not Track" setting.
- **Display:** screen resolution, available screen area, color depth and device pixel ratio.
- **Environment:** timezone, installed fonts, number of CPU cores and approximate device memory.
- **Media and plugins:** audio and video input and output devices, supported codecs.
- **Rendering behavior:** how your device draws graphics and processes audio (see below).
- **Network:** your IP address and, in some setups, details exposed through WebRTC.

### Canvas, WebGL and audio fingerprinting

Three techniques deserve a closer look because they reveal hardware and software differences that settings pages never show.

**Canvas fingerprinting.** A script asks the browser to draw hidden text or shapes with the HTML5 canvas element and reads back the pixels. Tiny differences in graphics drivers, fonts and anti-aliasing produce slightly different images on different machines, and that difference becomes a signal.

**WebGL fingerprinting.** WebGL lets pages render 3D graphics. A page can read details about the graphics renderer and test how it draws a scene, which exposes more about your GPU and driver stack.

**Audio fingerprinting.** Audio processing in the browser can differ subtly between devices. A script generates a sound without playing it and measures the result.

None of these require a permission prompt, which is why they are considered passive.

## Why websites use fingerprinting

It is easy to treat fingerprinting as purely sinister, but it is used for several different reasons:

1. **Fraud and abuse prevention.** Banks, payment providers and marketplaces use device signals to spot account takeovers and fake sign-ups.
2. **Bot detection.** A browser reporting impossible or inconsistent values is a strong signal of automation.
3. **Security.** Sites flag a login from a device they have never seen.
4. **Advertising and analytics.** Fingerprints can link visits across sites or sessions without cookies, which is the use privacy advocates object to most.

The same technique serves protective and invasive goals. That is why browsers, regulators and privacy groups keep debating it rather than banning it outright.

## How unique is your fingerprint?

It depends on how common your setup is. A mainstream browser on a popular laptop with default settings looks like many other browsers. A rare language combination, an unusual screen size, dozens of extra fonts and a heavily customized browser stand out.

This leads to a counterintuitive point that EFF highlights: the goal is not to be exotic. EFF recommends browsers and extensions that either present the same information regardless of the computer they run on, or randomize certain values so they cannot serve as a reliable identifier. Being one of a crowd, or being unpredictably different each time, both work. Being unusual and consistent works against you.

## How to check your own browser fingerprint

1. Open [Cover Your Tracks](https://coveryourtracks.eff.org/) from EFF and choose **Test your browser**. EFF says it collects only anonymous data.
2. Read the result summary. It reports whether your browser has protection against tracking and fingerprinting, and which characteristics make it most identifying.
3. Use the learning pages on the same site to understand each characteristic.
4. Change one thing at a time, then test again, so you know what made the difference.

If you use VertexStealth, the built-in Fingerprint Check lets you inspect selected properties your profile reports after launch, and you can open outside test pages from the same workflow. See the [product preview](/product-preview) for what the check looks like.

## How to reduce your fingerprint

Several habits meaningfully reduce how distinctive your browser is:

- **Use a current, mainstream browser** and keep it updated, so your version blends in with most users.
- **Prefer browsers with built-in protection.** Firefox and Brave include fingerprinting defenses, and EFF has worked with Brave to measure its approach.
- **Avoid unnecessary extensions and extra fonts.** Each one adds a distinguishing signal.
- **Keep your story consistent.** A timezone that does not match your IP location, or a language list that conflicts with the user agent, is itself a flag.
- **Separate identities into separate profiles** instead of reusing one browser for everything.

## Fingerprinting and multiple browser profiles

If you manage several accounts, client workspaces or test environments, separate cookies are only half the job. Two profiles that report an identical environment can look alike to a site even when their stored data is separate.

That is the problem a [multi-profile browser manager](/multi-profile-management) addresses. [VertexStealth](/antidetect-browser) launches your installed Chrome or Firefox with a dedicated profile folder and lets you configure supported signals per profile: user agent, language, timezone, screen, fonts, hardware-related values and rendering overrides, alongside a proxy and WebRTC options. Read [how it works](/how-it-works) or browse the full [feature list](/features).

Put it into practice: configure each profile, then verify what your browser actually reports rather than trusting a label. Combine that with a good proxy and consistent settings, and follow the laws and platform terms that apply to you.

## Frequently asked questions

### Is browser fingerprinting legal?

It depends on where you are and how it is used. Using device signals for security and fraud prevention is widely accepted. Using them to track people for advertising without consent can fall under privacy laws such as the GDPR in Europe. This article is general information, not legal advice.

### Does incognito mode stop fingerprinting?

No. Private windows mainly change what your own browser stores. Google's Chrome help notes that Incognito does not make you invisible, and your browser still reports its characteristics to the sites you visit.

### Can a VPN change my fingerprint?

A VPN changes your IP address and encrypts traffic between you and the VPN server. It does not change the browser-reported signals such as fonts, screen size or graphics behavior.

### Is a unique fingerprint always bad?

Not always. Banks use it to protect accounts. It becomes a privacy concern when it is used to link your activity across unrelated sites.

## Sources and further reading

- [Cover Your Tracks](https://coveryourtracks.eff.org/), Electronic Frontier Foundation: test your browser and read how trackers see it.
- [Find Out How Online Trackers Follow You on the Web With EFF's Cover Your Tracks Tool](https://www.eff.org/press/releases/find-out-how-online-trackers-follow-you-web-effs-cover-your-tracks-tool), EFF press release.
- [Browse in Incognito mode](https://support.google.com/chrome/answer/95464), Google Chrome Help.
