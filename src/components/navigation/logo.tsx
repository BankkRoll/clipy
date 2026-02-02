/**
 * Logo - App logo that switches between light/dark variants based on theme
 */

import logoDark from '@/assets/logo-dark.svg'
import logoLight from '@/assets/logo-light.svg'

interface LogoProps {
  className?: string
  size?: number
}

export default function Logo({ className = '', size = 24 }: LogoProps) {
  return (
    <>
      <img src={logoLight} alt="Clipy" width={size} height={size} className={`dark:hidden ${className}`} />
      <img src={logoDark} alt="Clipy" width={size} height={size} className={`hidden dark:block ${className}`} />
    </>
  )
}
