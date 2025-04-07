const RiskColor = ({ level }) => {
  const riskColors = {
    "No Risk": "bg-green-50 text-green-600 border border-green-200",
    "Low": "bg-blue-100 text-blue-800",
    "Medium": "bg-yellow-100 text-yellow-800",
    "High": "bg-orange-100 text-orange-800",
    "Critical": "bg-red-100 text-red-800"
  };

  const colorClass = riskColors[level] || "bg-gray-100 text-gray-800";

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>
      {level || "Unknown"}
    </span>
  );
};

export default RiskColor;