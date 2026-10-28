DIGITAL LEGACY — PROFESSIONAL EDITION
======================================

Digital Legacy is a private, browser-based planning workspace. It helps you
organize important account references, documents, and investment information,
choose trusted nominees, and understand how a careful future-access process
should work. Everything is encrypted and stored only in your own browser.

WHAT'S INCLUDED
---------------
- Account creation with password-derived encryption (PBKDF2 + AES-GCM 256-bit)
- Sign-in with "remember email" and an explicit delete-and-start-again route
- Signed-in sessions that survive a page refresh (they end when the tab closes)
- Overview dashboard with setup checklist, stats, and recent activity
- My Records: searchable, filterable records for financial accounts, social,
  insurance, document, investment, and service references with optional
  encrypted password storage
- My Nominees: trusted contacts with per-category permissions
- Owners I Nominate: owner-specific connections, a review workflow, and
  per-owner shared records (add, edit, remove, or fill a representative set)
- Inherited Records: full details of every record an approved owner released
  to you, including reveal and copy of released passwords
- Security & Privacy: clear explanation of how your data is protected
- Notifications with read/unread state
- Profile & Settings with account management
- Light and dark themes, switched from the button in the top bar and saved
  automatically for your next visit
- "Need a hand?" quick guide in the sidebar, explaining each section in plain
  language

HOW TO RUN
----------
1. Double-click START_WEBSITE.bat (it serves the site on http://127.0.0.1:8765)
2. Your browser opens automatically; if it doesn't, visit http://127.0.0.1:8765
3. Choose "New User?" and create an account — you are taken straight in
4. To test the nominee workflow, open "Owners I Nominate" and use
   connection code LEGACY-2026. Add the owner, press "Fill sample records",
   submit a death-certificate review request, mark it reviewed, then open
   "Inherited Records" to see every released record with its full details.

YOUR DATA AND PRIVACY
---------------------
- Your login password is never stored in plaintext. A verifier and an
  encryption key are derived from it using PBKDF2 (210,000 iterations).
- Vault contents are encrypted with AES-GCM before being written to browser
  storage. Only ciphertext is persisted.
- While you are signed in, the working key is also kept in sessionStorage so
  a page refresh restores your workspace. It clears when the tab closes and
  when you sign out.
- There is no server. Clearing browser data removes your account permanently,
  and a forgotten password cannot be recovered — the app offers an explicit
  delete-and-start-again route instead.
- The file chooser in the nominee workflow only records the selected filename.
  No file is uploaded or stored.

IMPORTANT
---------
Digital Legacy stores everything locally in the current browser on the current
computer. It does not sync devices and it does not connect to social platforms,
banks, brokers, email/SMS services, or identity providers. It is a personal
planning workspace, not a legally certified inheritance service. For legally
significant arrangements, keep official documents with their issuers and
consult a qualified professional.
