import React from 'react';

interface CustomInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const CustomInput: React.FC<CustomInputProps> = ({ label, ...props }) => {
  return (
    <div className="flex flex-col gap-2 w-full mb-4">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <input 
        {...props} 
        className="px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-500" 
      />
    </div>
  );
};

export default CustomInput;
