import "./style.css";
const root = document.querySelector<HTMLElement>("#app")!;
if (location.pathname.startsWith("/phone"))
  (await import("./phone")).phone(root);
else if (location.pathname === "/") (await import("./landing")).landing(root);
else if (location.pathname === "/sound") (await import("./laptop/sound")).sound(root);
else if (location.pathname === "/bottle") (await import("./laptop/bottle")).bottle(root);
else if (location.pathname === "/sonar") location.replace("/pendulum");
else (await import("./laptop")).laptop(root);
