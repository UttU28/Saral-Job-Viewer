'use client';

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, MapPin, Clock, Briefcase } from "lucide-react";
import { Job } from "@/types/job";
import { useState, useRef, useEffect } from "react";
import { highlightKeywords } from "@/lib/utils";

interface SwipeCardProps {
  job: Job;
  onSwipe: (direction: 'left' | 'right') => void;
}

function formatDate(dateString: string) {
  return new Date(parseInt(dateString) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function SwipeCard({ job, onSwipe }: SwipeCardProps) {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const SWIPE_THRESHOLD = 100; // Pixels to trigger swipe action

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleMouseStart = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    setCurrentX(currentX - startX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentX(e.clientX - startX);
  };

  const handleDragEnd = () => {
    if (Math.abs(currentX) >= SWIPE_THRESHOLD) {
      // Trigger swipe action
      const direction = currentX > 0 ? 'right' : 'left';
      onSwipe(direction);
    }
    setIsDragging(false);
    setCurrentX(0);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, currentX]);

  const rotation = currentX * 0.1;
  const opacity = Math.max(0, 1 - Math.abs(currentX) / 500);

  // Calculate background color based on swipe direction
  const getSwipeIndicator = () => {
    if (Math.abs(currentX) < SWIPE_THRESHOLD) return '';
    if (currentX > 0) {
      return 'before:absolute before:inset-0 before:bg-green-500/10 before:rounded-lg';
    }
    return 'before:absolute before:inset-0 before:bg-red-500/10 before:rounded-lg';
  };

  return (
    <Card 
      ref={cardRef}
      className={`absolute inset-0 bg-[#111111] border-purple-900/20 overflow-hidden cursor-grab active:cursor-grabbing before:transition-opacity ${getSwipeIndicator()}`}
      style={{
        transform: `translateX(${currentX}px) rotate(${rotation}deg)`,
        opacity,
        transition: isDragging ? 'none' : 'all 0.3s ease'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleDragEnd}
      onMouseDown={handleMouseStart}
      onMouseMove={handleMouseMove}
    >
      <div className="p-6 space-y-4 h-full flex flex-col relative">
        <div className="space-y-4">
          <h2 className="text-xl font-medium text-blue-300 break-words">
            {job.title}
          </h2>
          
          <div className="flex items-center gap-2 text-purple-300/70">
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="text-base break-words">{job.companyName}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="bg-blue-500/10 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20 text-sm">
              {job.method}
            </span>
            <span className="bg-purple-500/10 text-purple-300 px-3 py-1 rounded-full border border-purple-500/20 text-sm">
              {job.jobType}
            </span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="break-words">{job.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>{formatDate(job.timeStamp)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 shrink-0" />
              <span>ID: {job.id}</span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="text-sm text-gray-300 whitespace-pre-line break-words">
            {highlightKeywords(job.jobDescription)}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}