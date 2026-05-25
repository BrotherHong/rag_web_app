import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentDepartment, getDepartmentInfo } from '../services/api';

const toPublicAsset = (assetPath) => `${import.meta.env.BASE_URL}${assetPath.replace(/^\//, '')}`;

const ALL_OPTIONS = [
  {
    key: 'google',
    title: 'Google 登入',
    description: '使用 Google 帳號快速登入',
    path: '/login/google',
    logo: toPublicAsset('/images/google_logo.png'),
    logoAlt: 'Google',
    accent: 'from-red-500 via-yellow-400 to-blue-500',
  },
  {
    key: 'normal',
    title: '一般登入',
    description: '使用帳號密碼登入查詢系統',
    path: '/login/normal',
    accent: 'from-indigo-500 to-blue-600',
  },
  {
    key: 'success_portal',
    title: '成功入口登入',
    description: '透過成功入口單一簽入驗證',
    path: '/login/success-portal',
    logo: toPublicAsset('/images/cheng_kung_portal_logo.png'),
    logoAlt: '成功入口',
    accent: 'from-[#9f1c20] to-[#7a1518]',
  },
];

const extractDeptSlug = (path) => {
  if (!path || typeof path !== 'string') {
    return null;
  }

  const firstSegment = path.split('/').filter(Boolean)[0];
  if (!firstSegment) {
    return null;
  }

  const nonDeptRoutes = new Set(['login', 'forgot-password', '404']);
  return nonDeptRoutes.has(firstSegment) ? null : firstSegment;
};

function LoginMethodSelectPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/';
  const [filteredOptions, setFilteredOptions] = useState(ALL_OPTIONS);

  // Filter options based on department's enabled login methods.
  useEffect(() => {
    const fetchEnabledLoginMethods = async () => {
      const slugFromFromPath = extractDeptSlug(from);
      const fallbackSlug = getCurrentDepartment();
      const targetSlug = slugFromFromPath || fallbackSlug;

      if (!targetSlug) {
        setFilteredOptions(ALL_OPTIONS);
        return;
      }

      const response = await getDepartmentInfo(targetSlug);
      const loginMethods = response?.success ? response.data?.login_methods : null;

      if (!Array.isArray(loginMethods) || loginMethods.length === 0) {
        setFilteredOptions(ALL_OPTIONS);
        return;
      }

      const enabledMethods = new Set(loginMethods);
      const filtered = ALL_OPTIONS.filter((opt) => enabledMethods.has(opt.key));
      setFilteredOptions(filtered.length > 0 ? filtered : ALL_OPTIONS);
    };

    fetchEnabledLoginMethods();
  }, [from]);

  const options = filteredOptions;
  const optionCount = options.length;
  const panelWidthClass = optionCount <= 1 ? 'max-w-md' : optionCount === 2 ? 'max-w-4xl' : 'max-w-6xl';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff4f6_0%,_#f8fafc_45%,_#eef2ff_100%)] flex items-center justify-center px-4 py-10">
        <div className={`w-full ${panelWidthClass}`}>
        <div className="rounded-3xl border border-white/60 bg-white/75 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.10)] px-4 md:px-6 py-8 sm:px-10">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-slate-900">選擇登入方式</h1>
            <p className="text-slate-600 mt-2">請選擇您要使用的登入管道</p>
          </div>

          <div className="flex flex-wrap items-stretch justify-center gap-5">
            {options.map((option) => {
              const isLogoWide = option.key === 'success_portal';

              return (
                <button
                  key={option.key}
                  onClick={() => navigate(option.path, { state: { from } })}
                  className="group w-full sm:w-[320px] text-left bg-white/90 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer"
                >
                  <div className="h-16 mb-4 flex items-center">
                    {option.logo ? (
                      <img
                        src={option.logo}
                        alt={option.logoAlt}
                        className={isLogoWide ? 'h-12 w-auto object-contain' : 'h-12 w-12 object-contain rounded-xl'}
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${option.accent} flex items-center justify-center text-white shadow-md`}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5s-3 1.343-3 3 1.343 3 3 3zM5 19a7 7 0 0114 0" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <p className="text-xl sm:text-2xl leading-none font-black tracking-[-0.01em] text-slate-900">{option.title}</p>
                  <p className="text-sm text-slate-600 mt-2">{option.description}</p>
                  <div className={`mt-4 h-1.5 w-full rounded-full bg-gradient-to-r ${option.accent} opacity-70 group-hover:opacity-100 transition-opacity`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginMethodSelectPage;
