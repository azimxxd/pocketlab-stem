import "./style.css";
const root = document.querySelector<HTMLElement>("#app")!;
const mobileDevice =
  (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData?.mobile ??
  (/Android|iPhone|iPod|Mobile/i.test(navigator.userAgent) ||
    matchMedia("(max-width: 767px) and (pointer: coarse)").matches);

// The phone workflow is selected by device, not by requiring users to know
// the /phone URL. The same device check also handles QR links with /phone.
if (mobileDevice)
  (await import("./phone")).phone(root);
else if (location.pathname.startsWith("/phone")) location.replace("/");
else if (location.pathname === "/") (await import("./landing")).landing(root);
else if (location.pathname === "/sound") (await import("./laptop/sound")).sound(root);
else if (location.pathname === "/bottle") (await import("./laptop/bottle")).bottle(root);
else if (location.pathname === "/sonar") location.replace("/pendulum");
else (await import("./laptop")).laptop(root);
