import { Button } from '@/components/ui/button';
import { HomeIcon, LinkedinIcon, CheckCircleIcon, XCircleIcon, Loader2Icon, SaveIcon, ZapIcon, ArrowLeftIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { QuestionInput } from '@/components/linkedin/question-input';
import { FastMode } from '@/components/linkedin/fast-mode';

export interface LinkedInQuestion {
  question: string;
  type: string;
  required: boolean;
  options: string[] | null;
  currentAnswer: string | string[] | null;
  verified: boolean;
}

export function EasyApplyConfig() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<LinkedInQuestion[]>([]);
  const [editedQuestions, setEditedQuestions] = useState<LinkedInQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const unverifiedQuestions = editedQuestions.filter(q => !q.verified);
  const totalUnverified = unverifiedQuestions.length;
  const currentUnverifiedIndex = fastMode ? unverifiedQuestions.findIndex(q => 
    q.question === editedQuestions[currentQuestionIndex].question
  ) : -1;

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getLinkedInQuestions();
        setQuestions(response.data);
        setEditedQuestions(response.data);
        const firstUnverifiedIndex = response.data.findIndex(q => !q.verified);
        setCurrentQuestionIndex(firstUnverifiedIndex !== -1 ? firstUnverifiedIndex : 0);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch LinkedIn questions';
        setError(errorMessage);
        toast.error('Failed to load LinkedIn data', {
          description: errorMessage
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updatedQuestions = editedQuestions.map(question => ({
        ...question,
        verified: question.required ? !!question.currentAnswer : true
      }));

      await api.updateLinkedInQuestions(updatedQuestions);
      setQuestions(updatedQuestions);
      setEditedQuestions(updatedQuestions);
      setIsEditing(false);
      setFastMode(false);
      toast.success('Changes saved successfully');
    } catch (error) {
      toast.error('Failed to save changes', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedQuestions(questions);
    setIsEditing(false);
    setFastMode(false);
    toast.info('Changes discarded');
  };

  const updateAnswer = (index: number, value: string | string[] | null) => {
    const updatedQuestions = [...editedQuestions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      currentAnswer: value,
      verified: false
    };
    setEditedQuestions(updatedQuestions);
    if (!isEditing) setIsEditing(true);
  };

  const handleNext = () => {
    if (fastMode) {
      const nextUnverified = editedQuestions.findIndex((q, i) => !q.verified && i > currentQuestionIndex);
      if (nextUnverified !== -1) {
        setCurrentQuestionIndex(nextUnverified);
      } else {
        toast.success('All questions have been reviewed!', {
          description: 'You can now save your changes.'
        });
        setFastMode(false);
      }
    }
  };

  const handlePrevious = () => {
    if (fastMode) {
      const prevUnverified = [...editedQuestions].reverse().findIndex(
        (q, i) => !q.verified && (editedQuestions.length - 1 - i) < currentQuestionIndex
      );
      if (prevUnverified !== -1) {
        setCurrentQuestionIndex(editedQuestions.length - 1 - prevUnverified);
      }
    }
  };

  const startFastMode = () => {
    const firstUnverified = editedQuestions.findIndex(q => !q.verified);
    if (firstUnverified !== -1) {
      setCurrentQuestionIndex(firstUnverified);
      setFastMode(true);
      setIsEditing(true);
    } else {
      toast.info('All questions are already verified!');
    }
  };

  const renderHeader = () => (
    <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <LinkedinIcon className="h-6 w-6 text-primary" />
          <h1 className="text-lg font-semibold">LinkedIn Saral Apply</h1>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="h-4 w-4" />
                )}
                Save Changes
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate('/linkedin')}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Go Back
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate('/')}
          >
            <HomeIcon className="h-4 w-4" />
            Go Home
          </Button>
        </div>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2Icon className="h-8 w-8 animate-spin mx-auto text-accent" />
            <p className="text-muted-foreground">Loading LinkedIn data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-destructive text-xl font-semibold">Error Loading Data</div>
            <p className="text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="mx-auto"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (fastMode) {
    return (
      <FastMode
        currentQuestion={editedQuestions[currentQuestionIndex]}
        currentQuestionIndex={currentQuestionIndex}
        totalUnverified={totalUnverified}
        currentUnverifiedIndex={currentUnverifiedIndex}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onCancel={handleCancel}
        onSave={handleSave}
        isSaving={isSaving}
        onUpdateAnswer={(value) => updateAnswer(currentQuestionIndex, value)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {renderHeader()}
      <main className="flex-1 container max-w-4xl mx-auto py-12 px-4">
        <div className="text-center space-y-4 mb-8">
          <h2 className="text-4xl font-bold tracking-tight">
            LinkedIn Profile Data
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Your LinkedIn profile information that will be used for job applications.
            Click Save to update any changes you make.
          </p>
          {totalUnverified > 0 && (
            <Button
              variant="outline"
              onClick={startFastMode}
              className="gap-2"
            >
              <ZapIcon className="h-4 w-4" />
              Fast Mode ({totalUnverified} unverified)
            </Button>
          )}
        </div>

        <div className="space-y-6">
          {[...editedQuestions].reverse().map((item, index) => {
            const originalIndex = editedQuestions.length - 1 - index;

            return (
              <Card 
                key={originalIndex}
                className="p-6 bg-gradient-to-br from-black/40 to-black/60 border-border/20 hover:from-black/50 hover:to-black/70 transition-all duration-300 backdrop-blur-sm"
              >
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                      {item.type}
                    </div>
                    {item.verified ? (
                      <div className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                        <CheckCircleIcon className="h-3 w-3" />
                        <span>Verified</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        <XCircleIcon className="h-3 w-3" />
                        <span>Not Verified</span>
                      </div>
                    )}
                    {item.required && (
                      <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        Required Field
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-foreground/90 mb-4">
                      {item.question}
                    </h3>
                    <QuestionInput
                      question={item}
                      onUpdateAnswer={(value) => updateAnswer(originalIndex, value)}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}