import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { EasyApplyConfig } from '@/pages/EasyApplyConfig';
import { LinkedInJobs } from '@/pages/LinkedInJobs';
import { DiceJobs } from '@/pages/DiceJobs';
import { Button } from '@/components/ui/button';
import { LinkedinIcon, DicesIcon } from 'lucide-react';

function MainApp() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-8">
        <h1 className="text-4xl font-bold tracking-tight">
          Saral Job Apply
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose your job board to start applying
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="min-w-[200px] gap-2"
            onClick={() => navigate('/linkedin')}
          >
            <LinkedinIcon className="h-5 w-5" />
            LinkedIn Jobs
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="min-w-[200px] gap-2"
            onClick={() => navigate('/dice')}
          >
            <DicesIcon className="h-5 w-5" />
            Dice Jobs
          </Button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/linkedin" element={<LinkedInJobs />} />
          <Route path="/dice" element={<DiceJobs />} />
          <Route path="/config" element={<EasyApplyConfig />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;