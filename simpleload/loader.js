import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Register your custom loader
register(new URL("./resolve.js", import.meta.url), pathToFileURL("./"));
