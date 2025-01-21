import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface User {
  id: number;
  username: string;
  email: string;
  created_at: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    setIsLoading(false);
  }, []);

  const signIn = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.signIn({ username, password });
      
      // Store user data in localStorage and state
      localStorage.setItem('user', JSON.stringify(response));
      setUser(response);
      
      toast.success('Successfully signed in!', {
        description: 'Welcome back!'
      });
      
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again';
      toast.error('Failed to sign in', { description: message });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (username: string, email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.signUp({ username, email, password });
      
      // Store user data in localStorage and state
      localStorage.setItem('user', JSON.stringify(response));
      setUser(response);
      
      toast.success('Account created successfully!', {
        description: 'Welcome to LinkedIn Saral Apply!'
      });
      
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again';
      toast.error('Failed to create account', { description: message });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('user');
    setUser(null);
    toast.success('Signed out successfully');
  };

  return {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
  };
}