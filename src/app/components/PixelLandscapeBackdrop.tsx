import { motion } from 'motion/react';

interface PixelLandscapeBackdropProps {
  className?: string;
  theme?: 'warm' | 'sage' | 'ocean' | 'rose' | 'aurora' | 'sunset' | 'lavender' | 'graphite';
  hideDust?: boolean;
}

type ThemeName = NonNullable<PixelLandscapeBackdropProps['theme']>;

// Upgraded premium aesthetic color palettes (Base, Blob 1, Blob 2, Blob 3, Highlight)
const THEME_COLORS: Record<ThemeName, string[]> = {
  warm: ['#FFF2E8', '#FFB7B2', '#E2F0CB', '#FFDAC1', '#FFFFFF'],
  sage: ['#F3F7F4', '#B5EAD7', '#E2F0CB', '#C7CEEA', '#FFFFFF'],
  ocean: ['#F0F8FF', '#C4FAF8', '#A0E8AF', '#FFDAC1', '#FFFFFF'],
  rose: ['#FFF0F5', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#FFFFFF'],
  aurora: ['#F2FBF7', '#A0E8AF', '#C4FAF8', '#B5EAD7', '#FFFFFF'],
  sunset: ['#FFF4EB', '#FFDAC1', '#FF9AA2', '#FFB7B2', '#FFFFFF'],
  lavender: ['#F8F5FA', '#C7CEEA', '#FFB7B2', '#B5EAD7', '#FFFFFF'],
  graphite: ['#F5F5F5', '#E0E0E0', '#D5D5D5', '#CCCCCC', '#FFFFFF']
};

export function PixelLandscapeBackdrop({ className = '', theme = 'warm', hideDust = false }: PixelLandscapeBackdropProps) {
  const colors = THEME_COLORS[theme] || THEME_COLORS.warm;

  // Floating dust particles for a magical, meditative atmosphere
  const dustParticles = Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 20 + 20,
    delay: Math.random() * -20,
  }));

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`} style={{ backgroundColor: colors[0], transition: 'background-color 1.5s ease' }}>
      
      {/* Ambient Base Gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-1500"
        style={{
          background: `radial-gradient(circle at 50% 100%, ${colors[3]}33 0%, transparent 80%)`,
        }}
      />

      {/* Fluid Mesh Blob 1 */}
      <motion.div
        className="absolute rounded-full mix-blend-normal opacity-70"
        style={{ 
          background: `radial-gradient(circle, ${colors[1]} 0%, transparent 70%)`,
          width: '80vw', 
          height: '80vw', 
          top: '-10%', 
          left: '-20%',
        }}
        animate={{
          x: ['0vw', '25vw', '-15vw', '0vw'],
          y: ['0vw', '-20vw', '20vw', '0vw'],
          scale: [1, 1.4, 0.7, 1]
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Fluid Mesh Blob 2 */}
      <motion.div
        className="absolute rounded-full mix-blend-normal opacity-60"
        style={{ 
          background: `radial-gradient(circle, ${colors[2]} 0%, transparent 70%)`,
          width: '90vw', 
          height: '90vw', 
          bottom: '-20%', 
          right: '-10%',
        }}
        animate={{
          x: ['0vw', '-25vw', '15vw', '0vw'],
          y: ['0vw', '25vw', '-15vw', '0vw'],
          scale: [1, 1.5, 0.7, 1]
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: -2 }}
      />

      {/* Fluid Mesh Blob 3 */}
      <motion.div
        className="absolute rounded-full mix-blend-normal opacity-65"
        style={{ 
          background: `radial-gradient(circle, ${colors[3]} 0%, transparent 70%)`,
          width: '75vw', 
          height: '75vw', 
          top: '40%', 
          left: '40%',
        }}
        animate={{
          x: ['0vw', '-20vw', '25vw', '0vw'],
          y: ['0vw', '-20vw', '15vw', '0vw'],
          scale: [1, 1.3, 0.75, 1]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: -4 }}
      />

      {/* Center Character Highlight (Soft Glow) */}
      <motion.div
        className="absolute rounded-full opacity-80"
        style={{ 
          background: `radial-gradient(circle, ${colors[4]} 0%, transparent 60%)`,
          width: '60vw', 
          height: '50vw', 
          top: '30%', 
          left: '20%',
        }}
        animate={{
          opacity: [0.4, 0.95, 0.4],
          scale: [0.8, 1.25, 0.8]
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Glassmorphism Blend Layer - Crucial for the "Premium" look */}
      <div className="absolute inset-0 backdrop-blur-[60px]" />

      {/* Floating Light Dust */}
      <div className="absolute inset-0" style={{ opacity: hideDust ? 0 : 1, transition: 'opacity 400ms ease' }}>
        {dustParticles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full bg-white mix-blend-overlay"
            style={{
              width: p.size,
              height: p.size,
              left: `${p.x}%`,
              top: `${p.y}%`,
              filter: 'blur(1px)',
              opacity: 0.6
            }}
            animate={{
              y: ['0vh', '-30vh'],
              x: ['0vw', `${Math.random() * 20 - 10}vw`],
              opacity: [0, 0.8, 0]
            }}
            transition={{
              duration: p.duration * 0.3,
              repeat: Infinity,
              ease: 'linear',
              delay: p.delay * 0.3
            }}
          />
        ))}
      </div>

      {/* Premium Cinematic Noise Texture Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
