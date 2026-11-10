---
title: "WebRTC Privacy Leak Protection: A Browser Profile Check Workflow"
description: A step-by-step WebRTC privacy leak protection workflow for browser profiles: choose a policy, configure it, verify the results and document every check.
seoTitle: WebRTC Privacy Leak Protection: Profile Check Workflow
author: Oscar Odero
date: 2026-11-08
---
Most advice about WebRTC browser privacy stops at "turn it off" or "install an extension". The harder part is knowing, for a specific browser profile, that your setup does what you think it does. This guide turns WebRTC privacy leak protection into a repeatable routine you run before a session: decide a policy, configure the profile, verify the result and write it down.

If you are still choosing a proxy type, start with our guide to [HTTP vs SOCKS5 proxies for browser profiles](/blog/http-vs-socks5-proxy-browser-profiles); this article assumes a proxy is already working.

## What a WebRTC leak actually is

WebRTC is the browser technology behind video calls and peer-to-peer features. To connect two devices, it gathers "ICE candidates": possible network paths. MDN's [WebRTC connectivity guide](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity) describes three common kinds: host candidates (a device's own address), server-reflexive candidates (a public address learned through STUN) and relay candidates (a path through a TURN server).

The problem is that a web page can read these candidates. The IETF's [RFC 8828](https://www.rfc-editor.org/rfc/rfc8828.html) lists three ways this can reveal more than normal web traffic does:

- With a split-tunnel VPN, WebRTC can discover the ISP's public address as well as the VPN's.
- Behind a NAT, a page can learn private addresses. The RFC notes these can carry enough entropy to act as a fingerprinting surface, and can help link a normal and a private browsing session on one device.
- With a classic proxy, if direct internet access is allowed, WebRTC's STUN checks can bypass the proxy and expose the public address.

Browsers have reduced the private-address problem by replacing local addresses with random `.local` names; the IETF's [mDNS draft](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates) describes the idea, and our [proxy guide](/blog/http-vs-socks5-proxy-browser-profiles) covers the browser side. Public-address exposure still has to be tested, not assumed.

## Step 1: Decide the policy first

RFC 8828 defines four modes that trade privacy against call quality: use all interfaces, use the default route plus its associated local addresses, use the default route only, or force traffic through the proxy. Browsers expose similar choices. MDN's [privacy.network reference](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy/network) lists WebRTC policies running from `default` to `proxy_only`, ordered from least to most private.

Stricter is not always better. The RFC explains that HTTP and most SOCKS proxies do not carry UDP, so forcing WebRTC through them disables UDP and lowers media quality. Pick the policy per profile purpose, and write the choice down as part of your WebRTC configuration:

| Profile purpose | Reasonable starting point |
|---|---|
| Research or browsing that never needs calls | A strict option, then verify |
| Meetings, voice or video | A looser option that still hides private addresses |
| Testing a site that uses WebRTC itself | Start loose, verify, then tighten one step at a time |

These are starting points: the right choice depends on your browser, proxy and what the page needs, which is why Step 3 exists.

## Step 2: Configure the profile

In VertexStealth, each profile keeps its proxy, fingerprint and WebRTC profile settings together, so you can set them in one place; the [features page](/features) lists the controls and the [product preview](/product-preview) shows the layout. A sensible order:

1. Add the proxy and run the connection test.
2. Let time zone and location follow the proxy, or set them by hand.
3. Choose the WebRTC option that matches the policy from Step 1.

## Step 3: Verify the result

Configuration is a claim; verification is evidence. Run these browser privacy checks inside the profile:

| Check | What you should see |
|---|---|
| IP-check page | The proxy's address, not yours |
| WebRTC test page | No public address that matches your real connection |
| Candidate types | No unexpected host candidates with private addresses |
| IPv6 | No address from your own ISP if the proxy is IPv4 only |
| Time zone and language | Values that fit the proxy's location |

First record your real address from a normal browser, so you know exactly what a leak would look like. Two details help when reading results. RFC 8828 says an application can tell it is not receiving the full candidate set when host candidates are missing, which usually means a stricter mode is active; that is expected, not an error. And different test pages use different STUN servers, so run two before you trust a result. For the wider picture, add a pass through [Cover Your Tracks](https://coveryourtracks.eff.org/) or the built-in Fingerprint Check, and read [what browser fingerprinting is](/blog/what-is-browser-fingerprinting).

## Step 4: Document and repeat

Keep a simple log with one line per check: date, profile name, browser version, proxy, WebRTC option and the result. It takes a minute and pays off when something changes. Re-run the checks when:

- the browser updates,
- you change the proxy or its provider,
- you change the WebRTC option,
- you connect the host computer to a new VPN or network.

The W3C's [fingerprinting guidance](https://www.w3.org/TR/fingerprinting-guidance/) treats its measures as risk reducers, so the sensible habit is to keep testing. A log makes that practical: you check again instead of assuming.

## Troubleshooting

- **Your real address appears.** Switch to a stricter WebRTC option, confirm the proxy is active for that profile, and test again.
- **Calls stop working.** The policy is probably too strict for that profile. Loosen one step and retest.
- **A private address appears.** Check the browser version, then try a stricter option.
- **Two test pages disagree.** Repeat both, then trust the stricter result until you know why.

## Responsible use

WebRTC is one layer of your setup, alongside proxy quality, time zone and language, and your fingerprint settings. Use separate profiles for legitimate work and follow the rules of the sites you use; our [acceptable use policy](/acceptable-use) explains what is not allowed.

To build the routine into your daily workflow, see how [VertexStealth works](/how-it-works), explore the [antidetect browser overview](/antidetect-browser), or return to the [homepage](/).
