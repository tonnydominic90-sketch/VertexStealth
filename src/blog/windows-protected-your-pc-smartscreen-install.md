---
title: "Windows Protected Your PC: How to Install VertexStealth (SmartScreen Explained)"
seoTitle: Windows Protected Your PC: How to Install VertexStealth
description: Seeing "Windows protected your PC" when installing VertexStealth? See why SmartScreen shows it, how to continue safely and what we are exploring.
date: 2026-11-01
---
If you open the VertexStealth installer and Windows shows a blue **"Windows protected your PC"** window, nothing is broken and your computer has not found a virus. This is Microsoft Defender SmartScreen reacting to a new, unsigned installer. This guide explains why it happens, shows exactly how to continue, tells you how to check that you have the real file, and explains what we are exploring so future releases do not trigger it.

## Why does Windows say "Windows protected your PC"?

SmartScreen is a reputation service built into Windows and Microsoft Edge. Microsoft explains that it decides whether a downloaded app or installer is potentially malicious using signals such as download traffic, download history, past antivirus results and URL reputation. In plain terms, files that many people have downloaded without problems are trusted, and unfamiliar files get a warning.

The VertexStealth installer triggers the warning for two reasons:

1. **It is not code-signed yet.** Code signing attaches a verified publisher name to a file. Without it, Windows shows "Unknown publisher".
2. **It is new.** Microsoft's developer documentation says SmartScreen reputation is tied to the file itself. For an unsigned file, reputation has to be built from zero for each new version and does not carry over from earlier ones.

The warning means "Windows does not recognize this file yet". It does not mean "Windows found malware".

## How to install VertexStealth past the SmartScreen warning

1. **Download the installer** from the [VertexStealth download page](/download), which links to our official GitHub Releases page. If your browser says the file is not commonly downloaded, open the download list and choose **Keep** (or **Keep anyway**).
2. **Double-click the installer** in your Downloads folder.
3. When "Windows protected your PC" appears, **click More info**. This is a small link under the message, easy to miss.
4. Check that the app name shows the VertexStealth setup file. The publisher will read **Unknown publisher**.
5. **Click Run anyway.**
6. If User Account Control asks for permission, click **Yes** and follow the installer.
7. Open VertexStealth and create your account inside the app.

The [download page](/download) shows pictures of the two SmartScreen screens so you know which buttons to click.

## How can I be sure I have the real installer?

An unsigned file means you have to be more careful about where it comes from. Follow these rules:

- **Download only from our website or our GitHub Releases page.** Do not run copies from forums, chats or file-sharing links, even if they look identical.
- **Scan it if you want to.** Right-click the file and scan it with Microsoft Defender, or use an online multi-engine scanner. A clean result from several engines is a useful extra check.
- **Compare checksums when we provide them.** If a release page lists a SHA-256 checksum, open PowerShell in your Downloads folder and run `Get-FileHash "VertexStealth Setup.exe"` (use the real file name), then compare the result with the one on the release page.
- **Do not turn off SmartScreen or Windows Security.** You do not need to. Disabling protection to install one program leaves every other download unprotected.

## What if Windows blocks it completely?

On some newer Windows 11 PCs, a protection called Smart App Control can block apps that are not signed, and it does not offer a Run anyway button. That is a different message from "Windows protected your PC". If you see it, do not try to work around it by turning off other protections. Email us at support@vertexstealth.top with your Windows version (see also our [FAQ](/faq)) and we will help you find the safest option for your setup.

## What are we doing about it?

We are actively exploring solutions to stop this issue from occurring with future releases, and we want to be straightforward about how that works.

- **Code signing.** We are exploring code signing for the VertexStealth installer so that it shows a verified publisher name instead of "Unknown publisher".
- **Building reputation.** Microsoft's documentation says that even signed apps can be flagged as unrecognized until reputation accumulates through downloads, and that the changes to EV certificates in 2024 mean they no longer bypass SmartScreen. So signing helps, but the warning can take time to disappear completely.
- **Reviewing each release.** We are also looking at submitting new installers to Microsoft for review. Every release stays on a single official page.

We cannot promise when the warning will go away, because reputation is decided by Microsoft. We will update this article and the download page if that changes.

## Frequently asked questions

### Is the "Windows protected your PC" message a virus warning?

No. It says Windows does not recognize the app and suggests caution. It appears for any new or unsigned installer, including legitimate software from small developers.

### Is "Run anyway" safe to click?

It is safe when you are sure the file came from the official VertexStealth download page or GitHub Releases page. If you are unsure where a file came from, click Don't run and download it again from the official page.

### Will I see this warning every time I open VertexStealth?

No. SmartScreen checks files that have been downloaded from the internet, so it normally appears when you first run the installer. You may see it again when you install a new version, because reputation is built per file.

### Why doesn't VertexStealth just buy a certificate?

Code-signing certificates cost money every year, and VertexStealth is an early-stage product. We are exploring signing. A certificate alone does not guarantee that the warning disappears at once, as explained above.

### Does VertexStealth work on Windows 10 and Windows 11?

Yes. VertexStealth is a Windows 10 and 11 desktop app that launches your installed Chrome or Firefox. See the [features page](/features) and [how it works](/how-it-works).

## Sources and further reading

- [SmartScreen reputation for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation), Microsoft Learn.
- [Microsoft Edge support for Microsoft Defender SmartScreen](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-security-smartscreen), Microsoft Learn.
- [App and browser control in Windows Security (reputation-based protection)](https://support.microsoft.com/help/4013218), Microsoft Support.
- [How can SmartScreen help protect me in Microsoft Edge?](https://support.microsoft.com/help/17443), Microsoft Support.
