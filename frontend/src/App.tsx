import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { KeywordManager } from './components/KeywordManager'
import { Settings, Ban, Search, X, RotateCcw } from 'lucide-react'
import { getApiUrl } from './config/api'

const cleanJobTitle = (title: string): string => {
  if (!title) return ''
  
  const cleaned = title.replace(/\s+with\s+verification\s*$/i, '').trim()
  
  const separatorMatch = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (separatorMatch) {
    const [, first, second] = separatorMatch
    if (first.trim().toLowerCase() === second.trim().toLowerCase()) {
      return first.trim()
    }
  }
  
  const words = cleaned.split(/\s+/)
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2
    const firstHalf = words.slice(0, half).join(' ')
    const secondHalf = words.slice(half).join(' ')
    
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf
    }
  }
  
  const duplicateMatch = cleaned.match(/^(.+?)\s+\1$/i)
  if (duplicateMatch) {
    return duplicateMatch[1]
  }
  
  return cleaned
}

interface Job {
  id: string
  title: string
  companyName: string
  location: string
  jobType: string
  applied: string
  timeStamp: string
  link: string
  jobDescription: string
  aiProcessed?: boolean
  aiTags?: string
}

type TimeFilter = 'all' | '1h' | '3h' | '6h' | '24h'

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('1h')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([])
  const [isKeywordManagerOpen, setIsKeywordManagerOpen] = useState(false)
  const [blacklistConfirmation, setBlacklistConfirmation] = useState<{
    isOpen: boolean
    companyName: string
  }>({ isOpen: false, companyName: '' })

  // Fetch jobs from backend API with time filter
  const fetchJobs = useCallback(async (filter: TimeFilter = activeFilter) => {
    try {
      setLoading(true)
      setError(null)
      
      let response
      if (filter === 'all') {
        response = await fetch(getApiUrl('/getAllJobs'))
      } else {
        const hours = filter === '1h' ? 1 : filter === '3h' ? 3 : filter === '6h' ? 6 : 24
        response = await fetch(getApiUrl('/getHoursOfData'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ hours })
        })
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }
      const jobsData = await response.json()
      setJobs(jobsData)
      setFilteredJobs(jobsData) // Initialize filtered jobs
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [activeFilter])
  
  // Handle filter change
  const handleFilterChange = (filter: TimeFilter) => {
    setActiveFilter(filter)
    fetchJobs(filter)
    setIsDropdownOpen(false) // Close dropdown after selection
  }
  
  // Search functionality
  const handleSearch = (term: string) => {
    setSearchTerm(term)
    
    if (!term.trim()) {
      setFilteredJobs(jobs)
      return
    }
    
    const searchPattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    
    const filtered = jobs.filter(job => {
      const searchFields = [
        cleanJobTitle(job.title) || '',
        job.companyName || '',
        job.jobDescription || '',
        job.location || ''
      ].join(' ')
      
      return searchPattern.test(searchFields)
    })
    
    setFilteredJobs(filtered)
  }
  
  // Clear search
  const clearSearch = () => {
    setSearchTerm('')
    setFilteredJobs(jobs)
  }
  
  // Toggle dropdown
  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen)
  }
  
  // Close dropdown when clicking outside
  const closeDropdown = () => {
    setIsDropdownOpen(false)
  }
  
  // Get filter display text
  const getFilterDisplayText = (filter: TimeFilter) => {
    switch (filter) {
      case '1h': return 'Past 1 hour'
      case '3h': return 'Past 3 hours'
      case '6h': return 'Past 6 hours'
      case '24h': return 'Past 24 hours'
      case 'all': return 'All Jobs'
      default: return 'Select Filter'
    }
  }

  // Trigger LinkedIn scraping
  const startScraping = async () => {
    try {
      const response = await fetch(getApiUrl('/scrapeLinkedIn'))
      const result = await response.json()
      alert(result.message)
    } catch {
      alert('Failed to start scraping')
    }
  }

  // Show blacklist confirmation modal
  const showBlacklistConfirmation = (companyName: string) => {
    setBlacklistConfirmation({ isOpen: true, companyName })
  }

  // Close blacklist confirmation modal
  const closeBlacklistConfirmation = () => {
    setBlacklistConfirmation({ isOpen: false, companyName: '' })
  }

  // Add company to blacklist (actual API call)
  const confirmBlacklist = async () => {
    const companyName = blacklistConfirmation.companyName
    try {
      const response = await fetch(getApiUrl('/addKeyword'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim(), type: 'NoCompany' })
      })
      
      if (response.ok) {
        // Successfully blacklisted - no alert needed, modal will close
        console.log(`"${companyName}" has been added to blacklist`)
      } else {
        console.error('Failed to add company to blacklist')
      }
    } catch (error) {
      console.error('Error blacklisting company:', error)
    } finally {
      closeBlacklistConfirmation()
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.filter-dropdown-wrapper')) {
        setIsDropdownOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  // Handle click outside and escape key for blacklist confirmation modal
  useEffect(() => {
    if (!blacklistConfirmation.isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('blacklist-confirmation-overlay')) {
        closeBlacklistConfirmation()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBlacklistConfirmation()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [blacklistConfirmation.isOpen])
  
  // Update filtered jobs when jobs change
  useEffect(() => {
    if (searchTerm) {
      handleSearch(searchTerm)
    } else {
      setFilteredJobs(jobs)
    }
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <header className="header">
        <h1>SaralJob Viewer</h1>
        <div className="actions">
          <button onClick={startScraping} className="btn-primary">
            Start Scraping
          </button>
          <button 
            onClick={() => fetchJobs()} 
            className="btn-secondary btn-refresh-square"
            title="Refresh Jobs"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>
      
      <div className="filters-container">
        <div className="search-wrapper">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="Search jobs, companies, or descriptions..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={clearSearch} className="clear-search-btn">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        
        <div className="filter-dropdown-wrapper">
          <button 
            onClick={toggleDropdown}
            className={`filter-dropdown-trigger ${isDropdownOpen ? 'open' : ''}`}
          >
            <span className="filter-label">Time Filter:</span>
            <span className="filter-value">{getFilterDisplayText(activeFilter)}</span>
            <span className={`dropdown-arrow ${isDropdownOpen ? 'rotated' : ''}`}>▼</span>
          </button>
          
          {isDropdownOpen && (
            <>
              <div className="dropdown-overlay" onClick={closeDropdown}></div>
              <div className="filter-dropdown-menu">
                <div className="dropdown-header">Select Time Period</div>
                <button 
                  onClick={() => handleFilterChange('1h')} 
                  className={`dropdown-item ${activeFilter === '1h' ? 'active' : ''}`}
                >
                  <span className="item-label">Past 1 hour</span>
                  <span className="item-desc">&nbsp; Most recent jobs</span>
                  {activeFilter === '1h' && <span className="check-mark">✓</span>}
                </button>
                <button 
                  onClick={() => handleFilterChange('3h')} 
                  className={`dropdown-item ${activeFilter === '3h' ? 'active' : ''}`}
                >
                  <span className="item-label">Past 3 hours</span>
                  <span className="item-desc">&nbsp; Recent postings</span>
                  {activeFilter === '3h' && <span className="check-mark">✓</span>}
                </button>
                <button 
                  onClick={() => handleFilterChange('6h')} 
                  className={`dropdown-item ${activeFilter === '6h' ? 'active' : ''}`}
                >
                  <span className="item-label">Past 6 hours</span>
                  <span className="item-desc">&nbsp; Today's jobs</span>
                  {activeFilter === '6h' && <span className="check-mark">✓</span>}
                </button>
                <button 
                  onClick={() => handleFilterChange('24h')} 
                  className={`dropdown-item ${activeFilter === '24h' ? 'active' : ''}`}
                >
                  <span className="item-label">Past 24 hours</span>
                  <span className="item-desc">&nbsp; Last day</span>
                  {activeFilter === '24h' && <span className="check-mark">✓</span>}
                </button>
                <button 
                  onClick={() => handleFilterChange('all')} 
                  className={`dropdown-item ${activeFilter === 'all' ? 'active' : ''}`}
                >
                  <span className="item-label">All Jobs</span>
                  <span className="item-desc">&nbsp; Complete database</span>
                  {activeFilter === 'all' && <span className="check-mark">✓</span>}
                </button>
              </div>
            </>
          )}
        </div>
        
        <button onClick={() => setIsKeywordManagerOpen(true)} className="manage-keywords-btn">
          <Settings size={16} />
          <span>Manage Keywords</span>
        </button>
      </div>

      <main className="main">
        {loading && <div className="loading">Loading jobs...</div>}
        
        {error && (
          <div className="error">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="jobs-container">
            <div className="jobs-header">
              <h2>
                Found {filteredJobs.length} {searchTerm && filteredJobs.length !== jobs.length ? `of ${jobs.length}` : ''} Jobs 
                {activeFilter !== 'all' ? `(${activeFilter.toUpperCase()})` : ''}
                {searchTerm && (
                  <span className="search-indicator">
                    - Searching: "{searchTerm}"
                  </span>
                )}
              </h2>
      </div>
            
             {filteredJobs.length === 0 && jobs.length > 0 ? (
               <div className="no-results">
                 <div className="no-results-icon">
                   <Search size={48} />
                 </div>
                 <h3>No jobs found</h3>
                 <p>
                   {searchTerm ? 
                     `No jobs match your search "${searchTerm}". Try adjusting your search terms or clearing the search.` :
                     'No jobs found for the selected time filter.'
                   }
                 </p>
                 {searchTerm && (
                   <button onClick={clearSearch} className="btn-secondary">
                     Clear Search
                   </button>
                 )}
               </div>
             ) : (
               <div className="jobs-grid">
                 {filteredJobs.map((job) => (
                   <JobCard 
                     key={job.id} 
                     job={job} 
                     searchTerm={searchTerm} 
                     onShowBlacklistConfirmation={showBlacklistConfirmation}
                   />
                 ))}
               </div>
             )}
          </div>
        )}
      </main>
      
      <KeywordManager 
        isOpen={isKeywordManagerOpen} 
        onClose={() => setIsKeywordManagerOpen(false)} 
      />

      {/* Blacklist Confirmation Modal */}
      {blacklistConfirmation.isOpen && (
        <div className="blacklist-confirmation-overlay">
          <div className="blacklist-confirmation-modal">
            <div className="confirmation-header">
              <h3>Blacklist Company</h3>
              <button onClick={closeBlacklistConfirmation} className="close-btn">
                <X size={18} />
              </button>
            </div>
            
            <div className="confirmation-content">
              <div className="confirmation-icon">
                <Ban size={40} color="#cc0000" />
              </div>
              <p>Are you sure you want to blacklist this company?</p>
              <div className="company-name-display">
                <strong>"{blacklistConfirmation.companyName}"</strong>
              </div>
              <p className="confirmation-warning">
                Future jobs from this company will be filtered out from your search results.
              </p>
            </div>
            
            <div className="confirmation-actions">
              <button onClick={closeBlacklistConfirmation} className="btn-cancel">
                Cancel
              </button>
              <button onClick={confirmBlacklist} className="btn-confirm">
                Yes, Blacklist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Job Card Component
function JobCard({ 
  job, 
  searchTerm, 
  onShowBlacklistConfirmation 
}: { 
  job: Job
  searchTerm?: string
  onShowBlacklistConfirmation: (companyName: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  const timeAgo = (timestamp: string) => {
    try {
      const now = new Date()
      const jobDate = new Date(parseInt(timestamp) * 1000)
      const diffInSeconds = Math.floor((now.getTime() - jobDate.getTime()) / 1000)
      
      if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`
      } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60)
        return `${minutes}m ago`
      } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600)
        return `${hours}h ago`
      } else if (diffInSeconds < 2592000) {
        const days = Math.floor(diffInSeconds / 86400)
        return `${days}d ago`
      } else if (diffInSeconds < 31536000) {
        const months = Math.floor(diffInSeconds / 2592000)
        return `${months}mo ago`
      } else {
        const years = Math.floor(diffInSeconds / 31536000)
        return `${years}y ago`
      }
    } catch {
      return 'Unknown'
    }
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  const handleBlacklist = (e: React.MouseEvent) => {
    e.preventDefault() // Prevent any link navigation
    e.stopPropagation() // Stop event bubbling
    onShowBlacklistConfirmation(job.companyName)
  }
  
  // Highlight search terms in text
  const highlightText = (text: string, term?: string) => {
    if (!term || !text) return text
    
    try {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`(${escapedTerm})`, 'gi')
      const parts = text.split(pattern)
      
      return parts.map((part, index) => 
        pattern.test(part) ? 
          <mark key={index} className="search-highlight">{part}</mark> : 
          part
      )
    } catch {
      return text
    }
  }

  return (
    <div className="job-card">
      <div className="job-main">
        <div className="job-header">
          <a href={job.link} target="_blank" rel="noopener noreferrer" className="job-title-link">
            <h3>{highlightText(cleanJobTitle(job.title), searchTerm)}</h3>
          </a>
          <div className="job-header-buttons">
            <button 
              onClick={handleBlacklist} 
              className="btn-blacklist"
              title="Blacklist this company"
            >
              <Ban size={12} />
            </button>
            {job.jobDescription.trim() && (
              <button 
                onClick={toggleExpanded} 
                className="btn-expand-compact"
              >
                {isExpanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
        </div>
        
        <div className="job-meta-line">
          <span className="company-name">{highlightText(job.companyName, searchTerm)}</span>
          <span className="meta-separator">•</span>
          <span className="job-location">{highlightText(job.location, searchTerm)}</span>
          <span className="meta-separator">•</span>
          <span className="job-type">{job.jobType}</span>
          <span className="meta-separator">•</span>
          <span className="job-posted">{timeAgo(job.timeStamp)}</span>
        </div>

        <div className="job-description">
          <div className={`description-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
            {highlightText(job.jobDescription, searchTerm)}
          </div>
        </div>

      </div>
      </div>
  )
}

export default App
