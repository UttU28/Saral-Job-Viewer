import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeftIcon, ChevronRightIcon, SaveIcon, ZapIcon, Loader2Icon, CheckCircleIcon } from 'lucide-react';
import { QuestionInput } from './question-input';
import { useState } from 'react';
import { LinkedInQuestion } from '../../pages/EasyApplyConfig';

interface FastModeProps {
  currentQuestion: LinkedInQuestion;
  currentQuestionIndex: number;
  totalUnverified: number;
  currentUnverifiedIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  onUpdateAnswer: (value: string | string[] | null) => void;
}

export function FastMode({
  currentQuestion,
  currentQuestionIndex,
  totalUnverified,
  currentUnverifiedIndex,
  onPrevious,
  onNext,
  onCancel,
  onSave,
  isSaving,
  onUpdateAnswer,
}: FastModeProps) {
  const [showCompletion, setShowCompletion] = useState(false);
  const isLastQuestion = currentUnverifiedIndex === totalUnverified - 1;

  const handleNext = () => {
    if (isLastQuestion) {
      setShowCompletion(true);
    } else {
      onNext();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <ZapIcon className="h-6 w-6 text-yellow-500" />
            <h1 className="text-lg font-semibold">Fast Mode</h1>
            <span className="text-sm text-muted-foreground">
              ({currentUnverifiedIndex + 1} of {totalUnverified} unverified)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={onSave}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="h-4 w-4" />
              )}
              Save All Changes
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-2xl mx-auto py-12 px-4">
        {showCompletion ? (
          <Card className="p-6 bg-black/40 border-border/20">
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-6">
              <div className="h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center mb-2">
                <CheckCircleIcon className="h-12 w-12 text-accent" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold">All Questions Reviewed!</h3>
                <p className="text-muted-foreground max-w-md">
                  You've successfully reviewed all unverified questions. Click below to save your changes.
                </p>
              </div>
              <Button
                size="lg"
                onClick={onSave}
                disabled={isSaving}
                className="min-w-[200px] gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <SaveIcon className="h-4 w-4" />
                    Save All Changes
                  </>
                )}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 bg-gradient-to-br from-black/40 to-black/60 border-border/20 backdrop-blur-sm">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                  {currentQuestion.type}
                </div>
                {currentQuestion.required && (
                  <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    Required Field
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg font-medium text-foreground/90 mb-4">
                  {currentQuestion.question}
                </h3>
                <QuestionInput
                  question={currentQuestion}
                  onUpdateAnswer={onUpdateAnswer}
                />
              </div>

              <div className="flex justify-between pt-4 border-t border-border/10">
                <Button
                  variant="outline"
                  onClick={onPrevious}
                  disabled={currentUnverifiedIndex === 0}
                  className="hover:bg-background/10"
                >
                  <ChevronLeftIcon className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <Button
                  variant="default"
                  onClick={handleNext}
                  className="bg-accent hover:bg-accent/90"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}