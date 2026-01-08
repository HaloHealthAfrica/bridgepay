import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock } from 'lucide-react';

interface SearchSuggestion {
  text: string;
  type: 'recent' | 'suggestion';
}

interface TransactionSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  suggestions?: string[];
  recentSearches?: string[];
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export const TransactionSearch: React.FC<TransactionSearchProps> = ({
  value,
  onChange,
  onSearch,
  suggestions = [],
  recentSearches = [],
  isLoading = false,
  placeholder = "Search transactions...",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combine recent searches and suggestions
  const allSuggestions: SearchSuggestion[] = [
    ...recentSearches.map(text => ({ text, type: 'recent' as const })),
    ...suggestions.map(text => ({ text, type: 'suggestion' as const })),
  ].filter((item, index, self) => 
    // Remove duplicates
    self.findIndex(s => s.text === item.text) === index
  ).slice(0, 8); // Limit to 8 suggestions

  // Handle input focus
  const handleFocus = () => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle input blur
  const handleBlur = (e: React.FocusEvent) => {
    // Delay closing to allow clicking on suggestions
    setTimeout(() => {
      if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
        setIsOpen(false);
      }
    }, 150);
  };

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  // Handle key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < allSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          const selectedSuggestion = allSuggestions[highlightedIndex];
          handleSuggestionSelect(selectedSuggestion.text);
        } else if (value.trim()) {
          handleSearch();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: string) => {
    onChange(suggestion);
    onSearch(suggestion);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  // Handle search submission
  const handleSearch = () => {
    if (value.trim()) {
      onSearch(value.trim());
      setIsOpen(false);
    }
  };

  // Handle clear
  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Highlight matching text in suggestions
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-gray-900 font-medium">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={16} className={`${isLoading ? 'animate-pulse' : ''} text-gray-400`} />
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-button focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
          disabled={isLoading}
        />
        
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search Suggestions Dropdown */}
      {isOpen && allSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-button shadow-lg max-h-64 overflow-y-auto"
        >
          {allSuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.text}`}
              type="button"
              onClick={() => handleSuggestionSelect(suggestion.text)}
              className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 transition-colors ${
                index === highlightedIndex ? 'bg-gray-50' : ''
              }`}
            >
              {suggestion.type === 'recent' ? (
                <Clock size={14} className="text-gray-400 flex-shrink-0" />
              ) : (
                <Search size={14} className="text-gray-400 flex-shrink-0" />
              )}
              
              <span className="flex-1 text-sm">
                {highlightMatch(suggestion.text, value)}
              </span>
              
              {suggestion.type === 'recent' && (
                <span className="text-xs text-gray-400">Recent</span>
              )}
            </button>
          ))}
          
          {value.trim() && !allSuggestions.some(s => s.text.toLowerCase() === value.toLowerCase()) && (
            <button
              type="button"
              onClick={handleSearch}
              className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100 transition-colors ${
                highlightedIndex === allSuggestions.length ? 'bg-gray-50' : ''
              }`}
            >
              <Search size={14} className="text-primary flex-shrink-0" />
              <span className="flex-1 text-sm">
                Search for "<strong>{value}</strong>"
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};