// src/components/common/BrandLogo.jsx
import React, { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import BRANDING from '../../constants/branding';

/**
 * Reusable Brand Logo Component
 * Displays the brand logo with fallback to icon
 * 
 * @param {Object} props
 * @param {string} props.size - Size variant: 'sm', 'md', 'lg', 'xl' or custom className
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showText - Whether to show brand name next to logo
 * @param {string} props.variant - Logo variant: 'main', 'light', 'dark'
 */
const BrandLogo = ({ 
  size = 'md', 
  className = '', 
  showText = false,
  variant = 'main'
}) => {
  const [imageError, setImageError] = useState(false);

  // Size mappings
  const sizeMap = {
    sm: { container: 'w-6 h-6', icon: 'w-4 h-4', text: 'text-sm' },
    md: { container: 'w-9 h-9', icon: 'w-5 h-5', text: 'text-base' },
    lg: { container: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-lg' },
    xl: { container: 'w-16 h-16', icon: 'w-8 h-8', text: 'text-xl' }
  };

  const sizes = typeof size === 'string' && sizeMap[size] 
    ? sizeMap[size] 
    : { container: size, icon: size, text: 'text-base' };

  const logoPath = BRANDING.logo[variant] || BRANDING.logo.main;

  return (
    <div className={`flex items-center ${className}`}>
      <div className={`${sizes.container} purple-gradient rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0`}>
        {!imageError ? (
          <img 
            src={logoPath} 
            alt={BRANDING.name}
            className="w-full h-full object-contain p-1.5"
            onError={() => setImageError(true)}
          />
        ) : (
          <LayoutDashboard className={`${sizes.icon} text-white`} />
        )}
      </div>
      {showText && (
        <div className="ml-3 flex flex-col">
          <span className={`${sizes.text} font-bold text-gradient-purple dark:text-white transition-colors leading-tight`}>
            {BRANDING.name}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
            {BRANDING.tagline}
          </span>
        </div>
      )}
    </div>
  );
};

export default BrandLogo;

