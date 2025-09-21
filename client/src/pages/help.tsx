import { useQuery } from '@tanstack/react-query';
import { useRoute } from "wouter"
import React from 'react';

const HelpPage: React.FC = () => {
  const { match, params } = useRoute("/help/:category/:page");
  const { category, page } = params

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Help</h1>
      {category && page ? (
        <p>
          Category: {category as string}, Page: {page as string}
        </p>
      ) : (
        <p>Select a category and page from the navigation.</p>
      )}
      {/* Add your help content here based on the category and page */}
    </div>
  );
};

export default HelpPage;