import React, { useState, useEffect } from 'react'
import './KeywordManager.css'
import { X, Search, Ban } from 'lucide-react'
import { getApiUrl } from '../config/api'

interface Keyword {
  id: number
  name: string
  type: string
  created_at?: string
}

interface KeywordManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function KeywordManager({ isOpen, onClose }: KeywordManagerProps) {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(false)
  const [newSearchTerm, setNewSearchTerm] = useState('')
  const [newBlacklistedCompany, setNewBlacklistedCompany] = useState('')
  const [activeTab, setActiveTab] = useState<'search' | 'blacklist'>('search')

  // Fetch keywords from backend
  const fetchKeywords = async () => {
    try {
      setLoading(true)
      const response = await fetch(getApiUrl('/getKeywords'))
      if (response.ok) {
        const data = await response.json()
        setKeywords(data)
      }
    } catch (error) {
      console.error('Error fetching keywords:', error)
    } finally {
      setLoading(false)
    }
  }

  // Add keyword
  const addKeyword = async (name: string, type: string) => {
    try {
      const response = await fetch(getApiUrl('/addKeyword'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type })
      })
      
      if (response.ok) {
        fetchKeywords() // Refresh the list
        return true
      }
    } catch (error) {
      console.error('Error adding keyword:', error)
    }
    return false
  }

  // Remove keyword
  const removeKeyword = async (id: number) => {
    try {
      const response = await fetch(getApiUrl('/removeKeyword'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      
      if (response.ok) {
        fetchKeywords() // Refresh the list
      }
    } catch (error) {
      console.error('Error removing keyword:', error)
    }
  }

  // Handle add search term
  const handleAddSearchTerm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newSearchTerm.trim()) {
      const success = await addKeyword(newSearchTerm.trim(), 'SearchList')
      if (success) {
        setNewSearchTerm('')
      }
    }
  }

  // Handle add blacklisted company
  const handleAddBlacklistedCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newBlacklistedCompany.trim()) {
      const success = await addKeyword(newBlacklistedCompany.trim(), 'NoCompany')
      if (success) {
        setNewBlacklistedCompany('')
      }
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchKeywords()
    }
  }, [isOpen])

  // Handle click outside and escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('keyword-manager-overlay')) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Filter keywords by type
  const searchTerms = keywords.filter(k => k.type.toLowerCase() === 'searchlist')
  const blacklistedCompanies = keywords.filter(k => k.type.toLowerCase() === 'nocompany')

  if (!isOpen) return null

  return (
    <div className="keyword-manager-overlay">
      <div className="keyword-manager-modal">
        <div className="modal-header">
          <h2>Keyword Management</h2>
          <button onClick={onClose} className="close-btn">
            <X size={18} />
          </button>
        </div>

        <div className="modal-tabs">
          <button 
            className={`tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search Terms ({searchTerms.length})
          </button>
          <button 
            className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`}
            onClick={() => setActiveTab('blacklist')}
          >
            Blacklisted Companies ({blacklistedCompanies.length})
          </button>
        </div>

        <div className="modal-content">
          {activeTab === 'search' && (
            <div className="tab-content">
              <div className="section-header">
                <h3>Job Title Search Terms</h3>
                <p>Keywords that the scraper will use to find relevant jobs on LinkedIn</p>
              </div>
              
              <form onSubmit={handleAddSearchTerm} className="add-form">
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Enter job title or keyword (e.g., Software Engineer, Python Developer)"
                    value={newSearchTerm}
                    onChange={(e) => setNewSearchTerm(e.target.value)}
                    className="keyword-input"
                  />
                  <button type="submit" className="add-btn" disabled={!newSearchTerm.trim()}>
                    Add Search Term
                  </button>
                </div>
              </form>

              <div className="keywords-list">
                {loading && <div className="loading-text">Loading...</div>}
                {!loading && searchTerms.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Search size={48} color="var(--text-muted)" />
                    </div>
                    <p>No search terms configured</p>
                    <span>Add keywords above to help the scraper find relevant jobs</span>
                  </div>
                )}
                {searchTerms.map((keyword) => (
                  <div key={keyword.id} className="keyword-item search-term">
                    <div className="keyword-content">
                      <span className="keyword-name">{keyword.name}</span>
                    </div>
                    <button 
                      onClick={() => removeKeyword(keyword.id)}
                      className="remove-btn"
                      title="Remove search term"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'blacklist' && (
            <div className="tab-content">
              <div className="section-header">
                <h3>Blacklisted Companies</h3>
                <p>Companies to avoid - jobs from these companies will be filtered out</p>
              </div>
              
              <form onSubmit={handleAddBlacklistedCompany} className="add-form">
                <div className="input-group">
                  <input
                    type="text"
                    placeholder="Enter company name to blacklist (e.g., Acme Corp)"
                    value={newBlacklistedCompany}
                    onChange={(e) => setNewBlacklistedCompany(e.target.value)}
                    className="keyword-input"
                  />
                  <button type="submit" className="add-btn" disabled={!newBlacklistedCompany.trim()}>
                    Add to Blacklist
                  </button>
                </div>
              </form>

              <div className="keywords-list">
                {loading && <div className="loading-text">Loading...</div>}
                {!loading && blacklistedCompanies.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Ban size={48} color="var(--text-muted)" />
                    </div>
                    <p>No companies blacklisted</p>
                    <span>Add company names above to filter them out from job results</span>
                  </div>
                )}
                {blacklistedCompanies.map((keyword) => (
                  <div key={keyword.id} className="keyword-item blacklisted">
                    <div className="keyword-content">
                      <span className="keyword-name">{keyword.name}</span>
                    </div>
                    <button 
                      onClick={() => removeKeyword(keyword.id)}
                      className="remove-btn"
                      title="Remove from blacklist"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-info">
            <span>Search Terms: {searchTerms.length} | Blacklisted: {blacklistedCompanies.length}</span>
          </div>
          <button onClick={onClose} className="close-modal-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
