import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Package } from 'lucide-react';
import { fetchCategories } from '../../lib/productService';

interface CategoryItem {
  id: string;
  name: string;
  image_url?: string;
}

/**
 * CategoryItem Component
 * Displays a single category as a circular shortcut with image and name
 * Perfect alignment with fixed dimensions for professional appearance
 */
const CategoryItem: React.FC<{ category: CategoryItem; isMore?: boolean }> = ({
  category,
  isMore = false,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      to={isMore ? '/all-categories' : `/category/${category.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        textDecoration: 'none',
        width: '100%',
      }}
    >
      {/* Circle - 96px */}
      <div
        style={{
          width: 'clamp(68px, 16vw, 96px)',
          height: 'clamp(68px, 16vw, 96px)',
          borderRadius: '9999px',
          backgroundColor: '#F0F4FF',
          border: '1.5px solid #E0E7FF',
          boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 20px rgba(0,0,0,0.13)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.07)';
        }}
      >
        {isMore ? (
          <MoreHorizontal size={34} color="#6B7280" strokeWidth={2} />
        ) : category.image_url && !imgError ? (
          <img
            src={category.image_url}
            alt={category.name}
            style={{
              width: 'clamp(68px, 16vw, 96px)',
              height: 'clamp(68px, 16vw, 96px)',
              objectFit: 'cover',
              borderRadius: '9999px',
            }}
            onError={() => setImgError(true)}
          />
        ) : (
          <Package size={32} color="#CBD5E1" strokeWidth={1.5} />
        )}
      </div>

      {/* Label */}
      <p
        style={{
          marginTop: '10px',
          fontSize: 'clamp(11px, 2.8vw, 12.5px)',
          fontWeight: 600,
          color: '#1a1a1a',
          textAlign: 'center',
          lineHeight: '1.3',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          width: '100%',
          padding: '0 4px',
          boxSizing: 'border-box',
          minHeight: '34px',
          margin: 0,
        }}
      >
        {category.name}
      </p>
    </Link>
  );
};

const imageMap: { [key: string]: string } = {
  'Electronics': '/images/category-icons/ELECTRONICS.webp',
  'Fashion': '/images/category-icons/FASHION.webp',
  'Beauty & Health': '/images/category-icons/BEAUTY_AND_PERSONAL_CARE.webp',
  'Beauty & Personal Care': '/images/category-icons/BEAUTY_AND_PERSONAL_CARE.webp',
  'Home & Garden': '/images/category-icons/HOME_AND_GARDEN.webp',
  'Grocery': '/images/category-icons/Grocery.webp',
  'Grocery & Gourmet Food': '/images/category-icons/GROCERY_AND_GOURMET_FOOD.webp',
  'Grocery & Gourmet': '/images/category-icons/GROCERY_AND_GOURMET_FOOD.webp',
  'Health, Household & Baby Care': '/images/category-icons/HEALTH_HOUSEHOLD_AND_BABY_CARE.webp',
  'Health, Household & Baby': '/images/category-icons/HEALTH_HOUSEHOLD_AND_BABY_CARE.webp',
  'Sports & Outdoors': '/images/category-icons/SPORTS_AND_OUTDOORS.webp',
  'Sports, Fitness & Outdoors': '/images/category-icons/SPORTS_AND_OUTDOORS.webp',
  'Books': '/images/category-icons/BOOKS.webp',
  'Books & Media': '/images/category-icons/BOOKS.webp',
  'Toys, Games & Baby Products': '/images/category-icons/TOYS_GAMES_AND_BABY_PRODUCTS.webp',
  'Toys & Baby': '/images/category-icons/TOYS_GAMES_AND_BABY_PRODUCTS.webp',
  'Automotive & Industrial': '/images/category-icons/AUTOMOTIVE_AND_INDUSTRIAL.webp',
  'Automotive': '/images/category-icons/AUTOMOTIVE_AND_INDUSTRIAL.webp',
  'Jewellery & Luxury': '/images/category-icons/JEWELLERY_AND_LUXURY.webp',
  'Medical Equipment & Supplies': '/images/category-icons/MEDICAL_EQUIPMENT_AND_SUPPLIES.webp',
  'Safety & PPE': '/images/category-icons/SAFETY_AND_PPE.webp',
  'Software & Digital Products': '/images/category-icons/SOFTWARE_AND_DIGITAL_PRODUCTS.webp',
  'Industrial & Lab Supplies': '/images/category-icons/INDUSTRIAL_AND_LAB_SUPPLIES.webp',
  'Office Supplies & Stationery': '/images/category-icons/OFFICE_SUPPLIES_AND_STATIONERY.webp',
  'Gifts & Celebrations': '/images/category-icons/GIFTS_AND_CELEBRATIONS.webp',
  'Combo Offers': '/images/category-icons/COMBO_OFFERS.webp',
  'Home Appliances': '/images/category-icons/HOME_APPLIANCES.webp',
  'Musical Instruments': '/images/category-icons/MUSICAL_INSTRUMENTS.webp',
  'Garden & Outdoor Living': '/images/category-icons/GARDEN_AND_OUTDOOR_LIVING.webp',
  'Travel & Luggage': '/images/category-icons/TRAVEL_AND_LUGGAGE.webp',
};

export const Categories: React.FC = () => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    fetchCategories().then(({ data, error }) => {
      if (error) console.error('Failed to load homepage categories:', error);
      setCategories(
        data.map((c: any) => ({
          id: c.id,
          name: c.name,
          image_url: imageMap[c.name] || c.image_url,
        }))
      );
    });
  }, []);

  // Show first 16 categories across 2 rows of 8
  const visible = categories.slice(0, 16);

  return (
    <div style={{ padding: '16px 0' }}>
      <style>{`
        .category-grid {
          display: grid;
          grid-template-columns: repeat(8, minmax(0, 1fr));
          gap: 12px 8px;
          justify-items: center;
        }

        @media (max-width: 1024px) {
          .category-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }

        @media (max-width: 768px) {
          .category-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px 6px;
          }
        }

        @media (max-width: 480px) {
          .category-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px 6px;
          }
        }
      `}</style>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="category-grid">
          {visible.map((category) => (
            <CategoryItem key={category.id} category={category} />
          ))}
        </div>
      </div>
    </div>
  );
};
