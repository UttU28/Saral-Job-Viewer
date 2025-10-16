import { Header } from "../Header";
import { ThemeProvider } from "../ThemeProvider";

export default function HeaderExample() {
  return (
    <ThemeProvider>
      <Header
        onRefresh={() => console.log("Refresh clicked")}
        onOpenKeywords={() => console.log("Keywords clicked")}
      />
    </ThemeProvider>
  );
}
