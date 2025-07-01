import { exposeConfigContext } from "./config/config-context";
import { exposeDownloadContext } from "./download/download-context";
import { exposeEditorContext } from "./editor/editor-context";
import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowContext } from "./window/window-context";

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposeDownloadContext();
  exposeEditorContext();
  exposeConfigContext();
}
