import { useState, useEffect } from 'react'
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster, toast } from 'sonner';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { EasyApplyConfig } from '@/pages/EasyApplyConfig';
import { LinkedInJobs } from '@/pages/LinkedInJobs';
import { DiceJobs } from '@/pages/DiceJobs';
import { LinkedinIcon, ExternalLink, GithubIcon, Globe, Mail, Upload, FileText, User } from 'lucide-react';
import { Label } from './components/ui/label';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Separator } from './components/ui/separator';
import axios from 'axios';

// API base URL - replace with your actual API URL
const API_URL = 'http://localhost:5000';

// User information interface
interface UserInfo {
  id?: number;
  name: string;
  email?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  has_resume: boolean;
  has_cover_letter: boolean;
  created_at?: string;
  updated_at?: string;
}

// Custom Dice icon component since Lucide doesn't have one
const DiceIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="16" r="1.5" fill="currentColor" />
    <circle cx="16" cy="16" r="1.5" fill="currentColor" />
  </svg>
)

function MainApp() {
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('job-boards');
  
  // User form state
  const [userInfo, setUserInfo] = useState<UserInfo>({
    name: '',
    email: '',
    linkedin_url: '',
    github_url: '',
    portfolio_url: '',
    has_resume: false,
    has_cover_letter: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [isUploadingCoverLetter, setIsUploadingCoverLetter] = useState(false);

  // Fetch user info on component mount
  useEffect(() => {
    fetchUserInfo();
  }, []);

  // Function to fetch user info from backend
  const fetchUserInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/getUserInfo`);
      if (response.data) {
        setUserInfo(response.data);
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      toast.error('Failed to load user information');
    }
  };

  // Function to update user info
  const handleSaveUserInfo = async () => {
    if (!userInfo.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setIsSaving(true);
    try {
      const response = await axios.post(`${API_URL}/updateUser`, {
        name: userInfo.name,
        email: userInfo.email,
        linkedin_url: userInfo.linkedin_url,
        github_url: userInfo.github_url,
        portfolio_url: userInfo.portfolio_url
      });
      
      if (response.data && response.data.success) {
        // Update the form with the returned user data
        setUserInfo(response.data.user);
        toast.success('User information saved successfully');
      }
    } catch (error) {
      console.error('Error saving user info:', error);
      toast.error('Failed to save user information');
    } finally {
      setIsSaving(false);
    }
  };

  // Function to handle resume upload
  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file for your resume');
      return;
    }

    setIsUploadingResume(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/uploadResume`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setUserInfo(prev => ({ ...prev, has_resume: true }));
        toast.success(userInfo.has_resume 
          ? 'Resume updated successfully' 
          : 'Resume uploaded successfully');
      }
    } catch (error) {
      console.error('Error uploading resume:', error);
      toast.error('Failed to upload resume');
    } finally {
      setIsUploadingResume(false);
      // Clear the file input value to allow re-uploading the same file if needed
      const fileInput = document.getElementById('resume-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  // Function to handle cover letter upload
  const handleCoverLetterUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file for your cover letter');
      return;
    }

    setIsUploadingCoverLetter(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/uploadCoverLetter`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setUserInfo(prev => ({ ...prev, has_cover_letter: true }));
        toast.success(userInfo.has_cover_letter 
          ? 'Cover letter updated successfully' 
          : 'Cover letter uploaded successfully');
      }
    } catch (error) {
      console.error('Error uploading cover letter:', error);
      toast.error('Failed to upload cover letter');
    } finally {
      setIsUploadingCoverLetter(false);
      // Clear the file input value to allow re-uploading the same file if needed
      const fileInput = document.getElementById('cover-letter-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  };

  const handleLinkedInClick = () => {
    setSelectedOption('linkedin');
    navigate('/linkedin-jobs');
  };

  const handleDiceClick = () => {
    setSelectedOption('dice');
    navigate('/dice-jobs');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 text-foreground">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-600 mb-4">
            Welcome to Saral Job Apply
        </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your intelligent assistant for finding and applying to developer jobs.
          </p>
        </header>

        {/* Main content with tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-5xl mx-auto">
          <TabsList className="grid grid-cols-2 w-[400px] mx-auto mb-8">
            <TabsTrigger value="job-boards">Job Boards</TabsTrigger>
            <TabsTrigger value="profile">Your Profile</TabsTrigger>
          </TabsList>
          
          {/* Job Boards Tab */}
          <TabsContent value="job-boards">
            <div className="space-y-8">
              <h2 className="text-2xl font-semibold mb-6">
          Choose your job board to start applying
              </h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* LinkedIn Card - Now entirely clickable */}
                <div 
                  onClick={handleLinkedInClick}
                  className={`group cursor-pointer relative h-full rounded-lg border bg-card text-card-foreground shadow transition-all duration-300 hover:shadow-md hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary ${selectedOption === 'linkedin' ? 'ring-2 ring-primary' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label="Browse LinkedIn Jobs"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <LinkedinIcon className="h-6 w-6 text-blue-500" />
                      <span className="text-lg font-semibold">LinkedIn Jobs</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Browse and apply to jobs from your LinkedIn network
                    </p>
                    
                    <div className="h-32 flex items-center justify-center bg-muted/50 rounded-md mb-4">
                      <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/LinkedIn_icon.svg/2048px-LinkedIn_icon.svg.png" 
                        alt="LinkedIn Logo" 
                        className="h-16 w-16 object-contain"
                      />
                    </div>
                    
                    <div className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium bg-secondary rounded-md text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                      Browse LinkedIn Jobs
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-lg border-2 border-transparent group-hover:border-primary/50 group-focus:border-primary pointer-events-none"></div>
                </div>

                {/* Dice Card - Now entirely clickable */}
                <div 
                  onClick={handleDiceClick}
                  className={`group cursor-pointer relative h-full rounded-lg border bg-card text-card-foreground shadow transition-all duration-300 hover:shadow-md hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary ${selectedOption === 'dice' ? 'ring-2 ring-primary' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label="Browse Dice Jobs"
                >
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <DiceIcon className="h-6 w-6 text-purple-500" />
                      <span className="text-lg font-semibold">Dice Jobs</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Find tech and developer roles on the Dice platform
                    </p>
                    
                    <div className="h-32 flex items-center justify-center bg-muted/50 rounded-md mb-4">
                      <div className="bg-purple-600 h-16 w-16 flex items-center justify-center rounded-lg">
                        <DiceIcon className="h-10 w-10 text-white" />
                      </div>
                    </div>
                    
                    <div className="inline-flex items-center justify-center w-full h-10 px-4 py-2 text-sm font-medium bg-secondary rounded-md text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                      Browse Dice Jobs
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-lg border-2 border-transparent group-hover:border-primary/50 group-focus:border-primary pointer-events-none"></div>
                </div>
              </div>
              
              {/* Additional Features */}
              <div className="mt-16">
                <h3 className="text-xl font-medium mb-4 text-center">Smart Job Search Features</h3>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-card p-4 rounded-lg border">
                    <h4 className="font-medium mb-2 text-primary">Automated Filtering</h4>
                    <p className="text-muted-foreground">Automatically filter out jobs that don't match your criteria</p>
                  </div>
                  <div className="bg-card p-4 rounded-lg border">
                    <h4 className="font-medium mb-2 text-primary">Easy Apply</h4>
                    <p className="text-muted-foreground">One-click apply for supported job listings</p>
                  </div>
                  <div className="bg-card p-4 rounded-lg border">
                    <h4 className="font-medium mb-2 text-primary">Job Tracking</h4>
                    <p className="text-muted-foreground">Keep track of all your applications in one place</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="max-w-3xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Your Profile Information
                  </CardTitle>
                  <CardDescription>
                    Enter your details below to use with job applications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveUserInfo();
                    }}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
                        <Input 
                          id="name"
                          placeholder="Your full name"
                          value={userInfo.name}
                          onChange={(e) => setUserInfo(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={userInfo.email || ''}
                            onChange={(e) => setUserInfo(prev => ({ ...prev, email: e.target.value }))}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="linkedin">LinkedIn URL</Label>
                        <div className="relative">
                          <LinkedinIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="linkedin"
                            placeholder="https://linkedin.com/in/your-profile"
                            value={userInfo.linkedin_url || ''}
                            onChange={(e) => setUserInfo(prev => ({ ...prev, linkedin_url: e.target.value }))}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="github">GitHub URL</Label>
                        <div className="relative">
                          <GithubIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="github"
                            placeholder="https://github.com/your-username"
                            value={userInfo.github_url || ''}
                            onChange={(e) => setUserInfo(prev => ({ ...prev, github_url: e.target.value }))}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      
                      <div className="grid gap-2">
                        <Label htmlFor="portfolio">Portfolio URL</Label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="portfolio"
                            placeholder="https://your-portfolio.com"
                            value={userInfo.portfolio_url || ''}
                            onChange={(e) => setUserInfo(prev => ({ ...prev, portfolio_url: e.target.value }))}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save Information'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
              
              <Separator className="my-8" />
              
              {/* Resume and Cover Letter Uploads */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-5 w-5" />
                      Resume
                    </CardTitle>
                    <CardDescription>
                      {userInfo.has_resume 
                        ? "Your resume is uploaded. You can upload a new one to replace it." 
                        : "Upload your resume (PDF only)"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${userInfo.has_resume ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm">
                          {userInfo.has_resume 
                            ? 'Resume uploaded - You can update it anytime' 
                            : 'No resume uploaded'}
                        </span>
                      </div>
                      
                      <div className="relative">
                        <Input
                          type="file"
                          id="resume-upload"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleResumeUpload}
                        />
          <Button
                          type="button" 
                          variant="outline"
                          className="w-full"
                          disabled={isUploadingResume}
                          onClick={() => document.getElementById('resume-upload')?.click()}
          >
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploadingResume 
                            ? 'Uploading...' 
                            : userInfo.has_resume 
                              ? 'Upload New Resume' 
                              : 'Upload Resume'}
          </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-5 w-5" />
                      Cover Letter
                    </CardTitle>
                    <CardDescription>
                      {userInfo.has_cover_letter 
                        ? "Your cover letter is uploaded. You can upload a new one to replace it." 
                        : "Upload your cover letter (PDF only)"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${userInfo.has_cover_letter ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm">
                          {userInfo.has_cover_letter 
                            ? 'Cover letter uploaded - You can update it anytime' 
                            : 'No cover letter uploaded'}
                        </span>
                      </div>
                      
                      <div className="relative">
                        <Input
                          type="file"
                          id="cover-letter-upload"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleCoverLetterUpload}
                        />
          <Button
                          type="button" 
            variant="outline"
                          className="w-full"
                          disabled={isUploadingCoverLetter}
                          onClick={() => document.getElementById('cover-letter-upload')?.click()}
          >
                          <Upload className="h-4 w-4 mr-2" />
                          {isUploadingCoverLetter 
                            ? 'Uploading...' 
                            : userInfo.has_cover_letter 
                              ? 'Upload New Cover Letter' 
                              : 'Upload Cover Letter'}
          </Button>
        </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
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
          <Route path="/linkedin-jobs" element={<LinkedInJobs />} />
          <Route path="/dice-jobs" element={<DiceJobs />} />
          <Route path="/config" element={<EasyApplyConfig />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;