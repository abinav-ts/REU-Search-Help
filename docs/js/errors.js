// One friendly message and next step per error code (spec 05 section 6, spec 06 R-UI error panel).
// action: "retry" = Try again; "paste" = show the paste-text box; "examples" = point at the example chips.
export const ERRORS = {
  unauthorized: { title: "Demo key needed", text: "The demo key is missing or wrong. Enter the key you were given and try again.", action: "key" },
  rate_limited: { title: "Too many requests", text: "You are searching faster than the free service allows. Wait a minute and try again.", action: "retry" },
  bad_input: { title: "Check what you typed", text: "That input could not be used. Type a programme name or paste a link that starts with https://", action: "retry" },
  no_program_found: { title: "No official page found", text: "I could not find an official page for that. Try the full official name, or paste the link to the programme's own page.", action: "retry" },
  aggregator_only: { title: "Only listing pages found", text: "Only listing or news pages mention this programme. The links below are leads, not official sources.", action: null },
  js_required: { title: "The page would not load for me", text: "That page came back empty even after waiting for it, usually because it needs a browser to build the page. Paste its text and I will read that instead.", action: "paste" },
  blocked: { title: "The site blocks automated readers", text: "That site needs a login or blocks automatic reading. Open it yourself, copy the text, and paste it here.", action: "paste" },
  page_not_found: { title: "Page not found", text: "That page does not exist (error 404). Check the link, or search by the programme's name.", action: "retry" },
  timeout: { title: "This is taking too long", text: "The lookup did not finish in time. Try again, or try one of the saved examples, which load instantly.", action: "examples" },
  extraction_incomplete: { title: "I could not read that page reliably", text: "The reading did not come back in a usable form. Try again, or paste the page's text.", action: "paste" },
  upstream_error: { title: "A service I depend on failed", text: "A search or reading service had a problem. Wait a moment and try again.", action: "retry" },
  quota_exhausted: { title: "Free limit reached", text: "The free quota for searching or reading is used up for now. The saved examples below still work; try again in a few minutes.", action: "examples" },
  cv_unreadable: { title: "Could not read that CV", text: "The file had no readable text (a scan, perhaps). Fill in the profile by hand instead.", action: null },
  network: { title: "Connection lost", text: "I could not reach the server. Check your connection and try again.", action: "retry" },
};
export const errorInfo = (code) => ERRORS[code] || { title: "Something went wrong", text: "Please try again.", action: "retry" };
