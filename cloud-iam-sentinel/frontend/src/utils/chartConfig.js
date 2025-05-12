import { useTheme } from '@/contexts/ThemeContext';

export const useChartConfig = () => {
  const { darkMode } = useTheme();
  
  const getChartColors = () => {
    return {
      gridColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      textColor: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
      tickColor: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
    };
  };
  
  const getCommonOptions = () => {
    const colors = getChartColors();
    
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: colors.textColor
          }
        },
        tooltip: {
          backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          titleColor: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
          bodyColor: darkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
          borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        }
      },
      scales: {
        x: {
          grid: {
            color: colors.gridColor
          },
          ticks: {
            color: colors.tickColor
          },
          title: {
            color: colors.textColor
          }
        },
        y: {
          grid: {
            color: colors.gridColor
          },
          ticks: {
            color: colors.tickColor
          },
          title: {
            color: colors.textColor
          }
        }
      }
    };
  };
  
  return { getChartColors, getCommonOptions };
};