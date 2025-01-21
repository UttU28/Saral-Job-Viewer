import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2Icon } from 'lucide-react';

export function AuthForm() {
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (type: 'signin' | 'signup', e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading) return;

    try {
      setIsLoading(true);
      if (type === 'signin') {
        await signIn(formData.username, formData.password);
      } else {
        await signUp(formData.username, formData.email, formData.password);
      }
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, type: 'signin' | 'signup') => {
    if (e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      handleSubmit(type, e as unknown as React.MouseEvent);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-6 bg-black/40 border border-border/20 rounded-lg backdrop-blur-sm">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Welcome</h1>
        <p className="text-muted-foreground">Sign in to access your account</p>
      </div>

      <Tabs defaultValue="signin" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="space-y-4">
          <div className="space-y-4">
            <Input
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              onKeyPress={(e) => handleKeyPress(e, 'signin')}
              autoComplete="username"
            />
            <Input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              onKeyPress={(e) => handleKeyPress(e, 'signin')}
              autoComplete="current-password"
            />
            <Button
              className="w-full"
              onClick={(e) => handleSubmit('signin', e)}
              disabled={isLoading || !formData.username || !formData.password}
            >
              {isLoading ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Sign In
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="signup" className="space-y-4">
          <div className="space-y-4">
            <Input
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              onKeyPress={(e) => handleKeyPress(e, 'signup')}
              autoComplete="username"
            />
            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onKeyPress={(e) => handleKeyPress(e, 'signup')}
              autoComplete="email"
            />
            <Input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              onKeyPress={(e) => handleKeyPress(e, 'signup')}
              autoComplete="new-password"
            />
            <Button
              className="w-full"
              onClick={(e) => handleSubmit('signup', e)}
              disabled={isLoading || !formData.username || !formData.email || !formData.password}
            >
              {isLoading ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Sign Up
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}