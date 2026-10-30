Copy your three legal documents from the VertexStealth app project (its legal/ folder) into this folder:

  TERMS_OF_SERVICE.md
  PRIVACY_POLICY.md
  EULA.md

They are rendered to /terms, /privacy and /eula. The build stops with a clear message if any are missing,
so you can never accidentally publish the site without them.
To update them later: replace the file, commit, push - Vercel redeploys.
(Remember to bump LEGAL_VERSION in the app if the terms change.)
