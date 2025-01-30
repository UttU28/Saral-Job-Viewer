import { Button } from '@/components/ui/button';
import { HomeIcon, LinkedinIcon, CheckCircleIcon, XCircleIcon, Loader2Icon, SaveIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface LinkedInQuestion {
  question: string;
  type: string;
  required: boolean;
  options: string[] | null;
  currentAnswer: string | string[] | null;
  verified: boolean;
}

export function LinkedIn() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<LinkedInQuestion[]>([]);
  const [editedQuestions, setEditedQuestions] = useState<LinkedInQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await api.getLinkedInQuestions();
        setQuestions(response.data);
        setEditedQuestions(response.data);
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
      // Update verification status for questions with valid answers
      const updatedQuestions = editedQuestions.map(question => {
        // Check if the answer is valid (not empty or null)
        const hasValidAnswer = question.currentAnswer !== null && 
          question.currentAnswer !== '' && 
          (Array.isArray(question.currentAnswer) ? question.currentAnswer.length > 0 : true);

        // Set verified to true if there's a valid answer and it wasn't previously verified
        return {
          ...question,
          verified: hasValidAnswer ? true : question.verified
        };
      });

      await api.updateLinkedInQuestions(updatedQuestions);
      setQuestions(updatedQuestions);
      setEditedQuestions(updatedQuestions);
      setIsEditing(false);
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
    toast.info('Changes discarded');
  };

  const updateAnswer = (index: number, value: string | string[] | null) => {
    const updatedQuestions = [...editedQuestions];
    updatedQuestions[index] = {
      ...updatedQuestions[index],
      currentAnswer: value,
      verified: false // Reset verification when answer is changed
    };
    setEditedQuestions(updatedQuestions);
    if (!isEditing) setIsEditing(true);
  };

  const renderQuestionInput = (item: LinkedInQuestion, index: number) => {
    switch (item.type) {
      case 'Dropdown':
        return (
          <Select
            value={editedQuestions[index].currentAnswer?.toString() || ''}
            onValueChange={(value) => updateAnswer(index, value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{editedQuestions[index].currentAnswer || 'Select an option'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {item.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'Radio Button':
        return (
          <RadioGroup
            value={editedQuestions[index].currentAnswer?.toString()}
            onValueChange={(value) => updateAnswer(index, value)}
            className="flex gap-4"
          >
            {item.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${item.question}-${option}`} />
                <Label htmlFor={`${item.question}-${option}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'Text Input':
        return (
          <Input
            type="text"
            value={editedQuestions[index].currentAnswer?.toString() || ''}
            onChange={(e) => updateAnswer(index, e.target.value)}
            className="w-full"
          />
        );

      case 'Multiple Select (Checkbox)':
        const selectedOptions = Array.isArray(editedQuestions[index].currentAnswer)
          ? editedQuestions[index].currentAnswer
          : editedQuestions[index].currentAnswer ? [editedQuestions[index].currentAnswer] : [];
        
        return (
          <div className="grid grid-cols-2 gap-4">
            {item.options?.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${item.question}-${option}`}
                  checked={selectedOptions.includes(option)}
                  onCheckedChange={(checked) => {
                    const newSelected = checked
                      ? [...selectedOptions, option]
                      : selectedOptions.filter(o => o !== option);
                    updateAnswer(index, newSelected);
                  }}
                />
                <Label htmlFor={`${item.question}-${option}`}>{option}</Label>
              </div>
            ))}
          </div>
        );

      default:
        return <p className="text-muted-foreground">{editedQuestions[index].currentAnswer || 'No answer provided'}</p>;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2Icon className="h-8 w-8 animate-spin mx-auto text-accent" />
          <p className="text-muted-foreground">Loading LinkedIn data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
              onClick={() => navigate('/')}
            >
              <HomeIcon className="h-4 w-4" />
              Go to Home
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-4xl mx-auto py-12 px-4">
        <div className="text-center space-y-4 mb-8">
          <h2 className="text-4xl font-bold tracking-tight">
            LinkedIn Profile Data
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Your LinkedIn profile information that will be used for job applications.
            {isEditing ? ' Make your changes and click Save to update.' : ' Click on any field to edit.'}
          </p>
        </div>

        <div className="space-y-6">
          {editedQuestions.map((item, index) => (
            <Card key={index} className="p-6 bg-black/40 border-border/20">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-foreground">{item.question}</h3>
                    </div>
                    <div className="text-sm text-muted-foreground mb-4">
                      Type: {item.type}
                    </div>
                    {renderQuestionInput(item, index)}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {item.verified ? (
                      <div className="flex items-center gap-2 text-sm text-accent">
                        <CheckCircleIcon className="h-5 w-5" />
                        <span>Verified</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <XCircleIcon className="h-5 w-5" />
                        <span>Not Verified</span>
                      </div>
                    )}
                    {item.required && (
                      <div className="text-xs text-destructive">
                        *Required Field
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}