import { useThemeStore } from '../store/themeStore';

interface LogoProps {
  className?: string;
  alt?: string;
}

/**
 * Theme-aware logo component that displays the appropriate logo
 * based on the current theme (light or dark).
 */
export function Logo({ className = 'w-9 h-9', alt = 'Quai Vault Logo' }: LogoProps) {
  const { resolvedTheme } = useThemeStore();

  const logoSrc = resolvedTheme === 'light' ? '/logo-light.svg' : '/logo.svg';

  return (
    <img
      src={logoSrc}
      alt={alt}
      className={className}
    />
  );
}
