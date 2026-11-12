package com.bzead.india

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.StorefrontAppLink
import com.bzead.india.data.SupabaseClient
import com.bzead.india.data.parseStorefrontAppLink
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.BottomTab
import com.bzead.india.ui.components.BzeadBottomNav
import com.bzead.india.ui.screens.CartScreen
import com.bzead.india.ui.screens.CategoryScreen
import com.bzead.india.ui.screens.CheckoutScreen
import com.bzead.india.ui.screens.ForgotPasswordScreen
import com.bzead.india.ui.screens.HomeScreen
import com.bzead.india.ui.screens.LoginScreen
import com.bzead.india.ui.screens.NotificationsScreen
import com.bzead.india.ui.screens.NewPasswordScreen
import com.bzead.india.ui.screens.OTPVerificationScreen
import com.bzead.india.ui.screens.OrderDetailScreen
import com.bzead.india.ui.screens.OrderSuccessScreen
import com.bzead.india.ui.screens.OrdersScreen
import com.bzead.india.ui.screens.PolicyScreen
import com.bzead.india.ui.screens.ProductDetailScreen
import com.bzead.india.ui.screens.ProfileScreen
import com.bzead.india.ui.screens.SearchScreen
import com.bzead.india.ui.screens.SignupScreen
import com.bzead.india.ui.screens.WishlistScreen
import com.bzead.india.ui.splash.SplashScreen
import com.bzead.india.ui.theme.MyApplicationTheme

import com.bzead.india.ui.screens.ShippingAddressScreen
import com.bzead.india.ui.screens.OrderSummaryScreen
import com.bzead.india.ui.screens.AddressManagementScreen
import com.bzead.india.ui.screens.WriteReviewScreen
import com.bzead.india.ui.screens.SettingsScreen
import com.bzead.india.ui.screens.SectionProductsScreen
import com.bzead.india.ui.screens.ContactScreen
import com.bzead.india.ui.screens.NotFoundScreen
import com.bzead.india.ui.screens.OfflineScreen
import com.bzead.india.ui.screens.rememberNetworkStatus

sealed class AppScreen {
    data object Splash : AppScreen()
    data object Home : AppScreen()
    data object Category : AppScreen()
    data class CategoryDetail(val categoryId: String) : AppScreen()
    data object Cart : AppScreen()
    data object Profile : AppScreen()
    data object Search : AppScreen()
    data class ProductDetail(val productId: String) : AppScreen()
    data object Wishlist : AppScreen()
    data object Orders : AppScreen()
    data class OrderDetail(val orderId: String) : AppScreen()
    data class OrderSuccess(val orderId: String) : AppScreen()
    data object ShippingAddress : AppScreen()
    data object OrderSummary : AppScreen()
    data object Checkout : AppScreen()
    data object Login : AppScreen()
    data object Signup : AppScreen()
    data class OTPVerification(val email: String, val fullName: String = "", val purpose: String = "signup") : AppScreen()
    data class NewPassword(val email: String, val code: String) : AppScreen()
    data object ForgotPassword : AppScreen()
    data object Notifications : AppScreen()
    data class Policy(val type: String) : AppScreen()
    data object AddressManagement : AppScreen()
    data class WriteReview(val productId: String) : AppScreen()
    data object Settings : AppScreen()
    data class SectionProducts(val sectionId: String) : AppScreen()
    data object Contact : AppScreen()
    data object NotFound : AppScreen()
}

private fun AppScreen.toSavedRoute(): ArrayList<String> = ArrayList(when (this) {
    AppScreen.Splash -> listOf("splash")
    AppScreen.Home -> listOf("home")
    AppScreen.Category -> listOf("category")
    is AppScreen.CategoryDetail -> listOf("category-detail", categoryId)
    AppScreen.Cart -> listOf("cart")
    AppScreen.Profile -> listOf("profile")
    AppScreen.Search -> listOf("search")
    is AppScreen.ProductDetail -> listOf("product-detail", productId)
    AppScreen.Wishlist -> listOf("wishlist")
    AppScreen.Orders -> listOf("orders")
    is AppScreen.OrderDetail -> listOf("order-detail", orderId)
    is AppScreen.OrderSuccess -> listOf("order-success", orderId)
    AppScreen.ShippingAddress -> listOf("shipping-address")
    AppScreen.OrderSummary -> listOf("order-summary")
    AppScreen.Checkout -> listOf("checkout")
    AppScreen.Login -> listOf("login")
    AppScreen.Signup -> listOf("signup")
    is AppScreen.OTPVerification -> listOf("otp", email, fullName, purpose)
    is AppScreen.NewPassword -> listOf("new-password", email, code)
    AppScreen.ForgotPassword -> listOf("forgot-password")
    AppScreen.Notifications -> listOf("notifications")
    is AppScreen.Policy -> listOf("policy", type)
    AppScreen.AddressManagement -> listOf("address-management")
    is AppScreen.WriteReview -> listOf("write-review", productId)
    AppScreen.Settings -> listOf("settings")
    is AppScreen.SectionProducts -> listOf("section-products", sectionId)
    AppScreen.Contact -> listOf("contact")
    AppScreen.NotFound -> listOf("not-found")
})

private fun List<String>.toAppScreen(): AppScreen = when (firstOrNull()) {
    "splash" -> AppScreen.Splash
    "category" -> AppScreen.Category
    "category-detail" -> getOrNull(1)?.let { AppScreen.CategoryDetail(it) } ?: AppScreen.Home
    "cart" -> AppScreen.Cart
    "profile" -> AppScreen.Profile
    "search" -> AppScreen.Search
    "product-detail" -> getOrNull(1)?.let { AppScreen.ProductDetail(it) } ?: AppScreen.Home
    "wishlist" -> AppScreen.Wishlist
    "orders" -> AppScreen.Orders
    "order-detail" -> getOrNull(1)?.let { AppScreen.OrderDetail(it) } ?: AppScreen.Home
    "order-success" -> getOrNull(1)?.let { AppScreen.OrderSuccess(it) } ?: AppScreen.Home
    "shipping-address" -> AppScreen.ShippingAddress
    "order-summary" -> AppScreen.OrderSummary
    "checkout" -> AppScreen.Checkout
    "login" -> AppScreen.Login
    "signup" -> AppScreen.Signup
    "otp" -> getOrNull(1)?.let { AppScreen.OTPVerification(it, getOrNull(2).orEmpty(), getOrNull(3) ?: "signup") } ?: AppScreen.Login
    "new-password" -> if (size >= 3) AppScreen.NewPassword(this[1], this[2]) else AppScreen.ForgotPassword
    "forgot-password" -> AppScreen.ForgotPassword
    "notifications" -> AppScreen.Notifications
    "policy" -> getOrNull(1)?.let { AppScreen.Policy(it) } ?: AppScreen.Home
    "address-management" -> AppScreen.AddressManagement
    "write-review" -> getOrNull(1)?.let { AppScreen.WriteReview(it) } ?: AppScreen.Home
    "settings" -> AppScreen.Settings
    "section-products" -> getOrNull(1)?.let { AppScreen.SectionProducts(it) } ?: AppScreen.Home
    "contact" -> AppScreen.Contact
    "not-found" -> AppScreen.NotFound
    else -> AppScreen.Home
}

private fun AppScreen.requiresBuyerAuth(): Boolean = when (this) {
    AppScreen.Cart, AppScreen.Checkout, AppScreen.Orders, AppScreen.Wishlist,
    AppScreen.Notifications, AppScreen.Profile, AppScreen.ShippingAddress,
    AppScreen.OrderSummary, AppScreen.AddressManagement, AppScreen.Settings,
    is AppScreen.OrderDetail, is AppScreen.OrderSuccess, is AppScreen.WriteReview -> true
    else -> false
}

class MainActivity : ComponentActivity(), com.razorpay.PaymentResultWithDataListener {
    private data class AppLinkRequest(val uri: Uri, val sequence: Long)
    private var appLinkRequest by mutableStateOf<AppLinkRequest?>(null)
    private var appLinkSequence = 0L

    private fun receiveAppLink(uri: Uri?) {
        if (uri != null && parseStorefrontAppLink(uri) != null) {
            appLinkRequest = AppLinkRequest(uri, ++appLinkSequence)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == Intent.ACTION_VIEW) receiveAppLink(intent.data)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        appLinkRequest?.let { outState.putString("pending_storefront_app_link", it.uri.toString()) }
        super.onSaveInstanceState(outState)
    }

    override fun onPaymentSuccess(razorpayPaymentId: String?, data: com.razorpay.PaymentData?) {
        com.bzead.india.data.RazorpayLauncher.onSuccess(data, razorpayPaymentId)
    }

    override fun onPaymentError(code: Int, description: String?, data: com.razorpay.PaymentData?) {
        com.bzead.india.data.RazorpayLauncher.onError(code, description)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val restoredLink = savedInstanceState?.getString("pending_storefront_app_link")?.let(Uri::parse)
        if (restoredLink != null) receiveAppLink(restoredLink)
        else if (savedInstanceState == null && intent?.action == Intent.ACTION_VIEW) receiveAppLink(intent.data)
        try { com.razorpay.Checkout.preload(applicationContext) } catch (e: Exception) { e.printStackTrace() }
        com.bzead.india.data.BzeadRepository.init(applicationContext)
        com.bzead.india.data.BzeadFirebaseMessagingService.ensureChannel(applicationContext)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
                .launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        enableEdgeToEdge()
        setContent {
            MyApplicationTheme {
                val view = LocalView.current
                if (!view.isInEditMode) {
                    SideEffect {
                        val window = (view.context as? Activity)?.window
                        window?.statusBarColor = BzeadHeaderNavy.toArgb()
                        window?.navigationBarColor = BzeadHeaderNavy.toArgb()
                    }
                }

                val appScreenSaver = remember {
                    Saver<AppScreen, ArrayList<String>>(
                        save = { it.toSavedRoute() },
                        restore = { it.toAppScreen() }
                    )
                }
                val nullableAppScreenSaver = remember {
                    Saver<AppScreen?, ArrayList<String>>(
                        save = { it?.toSavedRoute() },
                        restore = { it?.toAppScreen() }
                    )
                }
                var currentScreen by rememberSaveable(stateSaver = appScreenSaver) {
                    mutableStateOf<AppScreen>(AppScreen.Splash)
                }
                var pendingLoginDestination by rememberSaveable(stateSaver = nullableAppScreenSaver) {
                    mutableStateOf<AppScreen?>(null)
                }
                var loginSuccessMessage by remember { mutableStateOf<String?>(null) }
                val snackbarHostState = remember { SnackbarHostState() }
                val cartItems by BzeadRepository.cartItems.collectAsState()
                val cartCount = cartItems.sumOf { it.quantity }
                val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
                val authLoading by BzeadRepository.isAuthLoading.collectAsState()

                androidx.compose.runtime.LaunchedEffect(currentScreen, isLoggedIn, authLoading) {
                    if (authLoading) return@LaunchedEffect
                    if (!isLoggedIn && currentScreen.requiresBuyerAuth()) {
                        pendingLoginDestination = currentScreen
                        currentScreen = AppScreen.Login
                    } else if (isLoggedIn && (currentScreen == AppScreen.Login || currentScreen == AppScreen.Signup)) {
                        currentScreen = AppScreen.Home
                    }
                }

                val currentBottomTab = when (currentScreen) {
                    AppScreen.Home -> BottomTab.HOME
                    AppScreen.Orders -> BottomTab.ORDERS
                    AppScreen.Category -> BottomTab.CATEGORY
                    is AppScreen.CategoryDetail -> BottomTab.CATEGORY
                    AppScreen.Cart -> BottomTab.CART
                    AppScreen.Profile -> BottomTab.ACCOUNT
                    AppScreen.Login -> BottomTab.ACCOUNT
                    else -> null
                }

                val linkScope = rememberCoroutineScope()
                val openLink: (String) -> Unit = { raw ->
                    val link = raw.trim()
                    if (link.startsWith("/")) {
                        // Relative links resolve against the web app's routes (App.tsx).
                        val parts = link.substringBefore('?').substringBefore('#').trim('/').split('/')
                        when {
                            parts.size == 3 && parts[0] == "products" && parts[1] == "section" -> currentScreen = AppScreen.SectionProducts(parts[2])
                            parts.size == 2 && parts[0] == "products" && (parts[1] == "featured" || parts[1] == "hot-deals") ->
                                currentScreen = AppScreen.SectionProducts(parts[1])
                            parts.size == 2 && parts[0] == "category" -> currentScreen = AppScreen.CategoryDetail(parts[1])
                            parts.size == 2 && (parts[0] == "products" || parts[0] == "share") && parts[1] != "section" ->
                                linkScope.launch {
                                    BzeadRepository.resolveProductRef(parts[1])?.let { currentScreen = AppScreen.ProductDetail(it) }
                                }
                            parts.size == 1 && parts[0] == "cart" -> currentScreen = AppScreen.Cart
                            parts.size == 1 && parts[0] == "wishlist" -> currentScreen = AppScreen.Wishlist
                            parts.size == 1 && parts[0] == "orders" -> currentScreen = AppScreen.Orders
                            parts.size == 1 && parts[0] == "notifications" -> currentScreen = AppScreen.Notifications
                            parts.size == 1 && parts[0] == "profile" -> currentScreen = AppScreen.Profile
                            parts.size == 1 && parts[0] == "contact" -> currentScreen = AppScreen.Contact
                            parts.size == 1 && parts[0] == "shipping-policy" -> currentScreen = AppScreen.Policy("shipping")
                            parts.size == 1 && parts[0] == "refund-policy" -> currentScreen = AppScreen.Policy("refund")
                            parts.size == 1 && parts[0] == "privacy-policy" -> currentScreen = AppScreen.Policy("privacy")
                            parts.size == 1 && parts[0] == "terms-and-conditions" -> currentScreen = AppScreen.Policy("terms")
                            parts.size == 1 && parts[0] == "terms-of-service" -> currentScreen = AppScreen.Policy("terms-of-service")
                            parts.size == 1 && parts[0] == "about" -> currentScreen = AppScreen.Policy("about")
                            parts.size == 1 && parts[0] == "not-found" -> currentScreen = AppScreen.NotFound
                            parts.size == 1 && (parts[0] == "all-categories" || parts[0].isEmpty()) -> currentScreen = AppScreen.Home
                            else -> currentScreen = AppScreen.NotFound
                        }
                    } else if (link.startsWith("http://") || link.startsWith("https://")) {
                        try {
                            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(link)))
                        } catch (e: Exception) {
                        }
                    }
                }

                val context = LocalContext.current
                var backPressedTime by remember { mutableStateOf(0L) }
                val screenHistory = remember { mutableListOf<AppScreen>(AppScreen.Home) }

                fun navigateTo(screen: AppScreen) {
                    if (screen == currentScreen) return
                    if (screen == AppScreen.Home) {
                        screenHistory.clear()
                        screenHistory.add(AppScreen.Home)
                    } else {
                        if (screenHistory.lastOrNull() != screen) {
                            screenHistory.add(screen)
                        }
                    }
                    currentScreen = screen
                }

                fun navigateBack() {
                    if (screenHistory.size > 1) {
                        screenHistory.removeAt(screenHistory.lastIndex)
                        currentScreen = screenHistory.last()
                    } else if (currentScreen != AppScreen.Home) {
                        currentScreen = AppScreen.Home
                        screenHistory.clear()
                        screenHistory.add(AppScreen.Home)
                    }
                }

                val pendingAppLink = appLinkRequest
                androidx.compose.runtime.LaunchedEffect(pendingAppLink) {
                    if (pendingAppLink == null) return@LaunchedEffect
                    if (currentScreen == AppScreen.Splash) navigateTo(AppScreen.Home)
                    when (val route = parseStorefrontAppLink(pendingAppLink.uri)) {
                        is StorefrontAppLink.Product -> {
                            try {
                                val productId = SupabaseClient.resolveAppLinkProduct(route.reference)
                                if (productId == null) {
                                    navigateTo(AppScreen.NotFound)
                                } else {
                                    pendingLoginDestination = null
                                    navigateTo(AppScreen.ProductDetail(productId))
                                }
                            } catch (e: kotlinx.coroutines.CancellationException) {
                                throw e
                            } catch (e: com.bzead.india.data.CheckoutException) {
                                snackbarHostState.showSnackbar(e.message ?: "Unable to load this product link.")
                            }
                        }
                        is StorefrontAppLink.Section -> {
                            pendingLoginDestination = null
                            navigateTo(AppScreen.SectionProducts(route.name))
                        }
                        StorefrontAppLink.Browser -> {
                            val browser = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_BROWSER)
                                .setData(pendingAppLink.uri)
                            try {
                                startActivity(browser)
                            } catch (e: android.content.ActivityNotFoundException) {
                                snackbarHostState.showSnackbar("No browser is available to open this link.")
                            }
                        }
                        null -> Unit
                    }
                    if (appLinkRequest == pendingAppLink) appLinkRequest = null
                }

                BackHandler(enabled = true) {
                    if (currentScreen == AppScreen.Home) {
                        val now = System.currentTimeMillis()
                        if (now - backPressedTime < 2000L) {
                            (context as? Activity)?.finish()
                        } else {
                            backPressedTime = now
                            Toast.makeText(context, "Press back button again to Exit", Toast.LENGTH_SHORT).show()
                        }
                    } else if (currentScreen == AppScreen.Splash) {
                        (context as? Activity)?.finish()
                    } else {
                        navigateBack()
                    }
                }

                val networkStatus = rememberNetworkStatus()
                Box(modifier = Modifier.fillMaxSize()) {
                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    containerColor = BzeadHeaderNavy,
                    contentWindowInsets = WindowInsets(0, 0, 0, 0),
                    snackbarHost = { SnackbarHost(snackbarHostState) },
                    bottomBar = {
                        if (currentBottomTab != null) {
                            BzeadBottomNav(
                                currentTab = currentBottomTab,
                                onTabSelected = { tab ->
                                    val target = when (tab) {
                                        BottomTab.HOME -> AppScreen.Home
                                        BottomTab.ORDERS -> AppScreen.Orders
                                        BottomTab.CATEGORY -> AppScreen.Category
                                        BottomTab.CART -> if (isLoggedIn) AppScreen.Cart else AppScreen.Login
                                        BottomTab.ACCOUNT -> if (isLoggedIn) AppScreen.Profile else AppScreen.Login
                                    }
                                    navigateTo(target)
                                },
                                isLoggedIn = isLoggedIn,
                                cartCount = cartCount
                            )
                        }
                    }
                ) { innerPadding ->
                    Surface(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding),
                        color = Color(0xFFF8FAFC)
                    ) {
                        Crossfade(
                            targetState = currentScreen,
                            animationSpec = tween(durationMillis = 350),
                            label = "MainCrossfade"
                        ) { screen ->
                            when (screen) {
                                is AppScreen.Splash -> {
                                    SplashScreen(
                                        onSplashFinished = {
                                            if (currentScreen == AppScreen.Splash) navigateTo(AppScreen.Home)
                                        }
                                    )
                                }
                                is AppScreen.Home -> {
                                    HomeScreen(
                                        onNavigateToSearch = { navigateTo(AppScreen.Search) },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        onNavigateToCategory = { id -> navigateTo(AppScreen.CategoryDetail(id)) },
                                        onNavigateToSection = { id -> navigateTo(AppScreen.SectionProducts(id)) },
                                        onOpenLink = openLink,
                                        onNavigateToNotifications = { navigateTo(AppScreen.Notifications) },
                                        onNavigateToCart = { navigateTo(AppScreen.Cart) },
                                        onNavigateToWishlist = { navigateTo(AppScreen.Wishlist) },
                                        onNavigateToAccount = { navigateTo(AppScreen.Profile) },
                                        onNavigateToOrders = { navigateTo(AppScreen.Orders) },
                                        onNavigateToContact = { navigateTo(AppScreen.Contact) },
                                        onNavigateToLogin = { navigateTo(AppScreen.Login) },
                                        onNavigateToSignup = { navigateTo(AppScreen.Signup) },
                                        snackbarHostState = snackbarHostState
                                    )
                                }
                                is AppScreen.CategoryDetail -> {
                                    CategoryScreen(
                                        initialCategoryId = screen.categoryId,
                                        onNavigateBack = { navigateBack() },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        onNavigateToSearch = { navigateTo(AppScreen.Search) },
                                        onNavigateToCart = { navigateTo(AppScreen.Cart) },
                                        onNavigateToWishlist = { navigateTo(AppScreen.Wishlist) },
                                        snackbarHostState = snackbarHostState,
                                        isCategoryPage = true
                                    )
                                }
                                is AppScreen.Category -> {
                                    CategoryScreen(
                                        onNavigateBack = { navigateBack() },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        onNavigateToSearch = { navigateTo(AppScreen.Search) },
                                        onNavigateToCart = { navigateTo(AppScreen.Cart) },
                                        onNavigateToWishlist = { navigateTo(AppScreen.Wishlist) },
                                        snackbarHostState = snackbarHostState
                                    )
                                }

                                is AppScreen.Cart -> {
                                    CartScreen(
                                        onNavigateToHome = { navigateTo(AppScreen.Home) },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        onProceedToCheckout = { navigateTo(AppScreen.ShippingAddress) }
                                    )
                                }
                                is AppScreen.ShippingAddress -> {
                                    ShippingAddressScreen(
                                        onNavigateBack = { navigateBack() },
                                        onProceedToSummary = { navigateTo(AppScreen.OrderSummary) }
                                    )
                                }
                                is AppScreen.OrderSummary -> {
                                    OrderSummaryScreen(
                                        onNavigateBack = { navigateBack() },
                                        onProceedToPayment = { navigateTo(AppScreen.Checkout) },
                                        onNavigateToCart = { navigateTo(AppScreen.Cart) }
                                    )
                                }
                                is AppScreen.Profile -> {
                                    ProfileScreen(
                                        onNavigateToOrders = { navigateTo(AppScreen.Orders) },
                                        onNavigateToWishlist = { navigateTo(AppScreen.Wishlist) },
                                        onNavigateToNotifications = { navigateTo(AppScreen.Notifications) },
                                        onNavigateToPolicy = { type -> navigateTo(AppScreen.Policy(type)) },
                                        onNavigateToAddresses = { navigateTo(AppScreen.AddressManagement) },
                                        onNavigateToSettings = { navigateTo(AppScreen.Settings) },
                                        onNavigateToContact = { navigateTo(AppScreen.Contact) },
                                        onNavigateToLogin = { navigateTo(AppScreen.Login) },
                                        onNavigateToSignup = { navigateTo(AppScreen.Signup) },
                                        onNavigateToHome = {
                                            pendingLoginDestination = null
                                            navigateTo(AppScreen.Home)
                                        },
                                        snackbarHostState = snackbarHostState
                                    )
                                }
                                is AppScreen.Search -> {
                                    SearchScreen(
                                        onNavigateBack = { navigateBack() },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        snackbarHostState = snackbarHostState
                                    )
                                }
                                is AppScreen.ProductDetail -> {
                                    ProductDetailScreen(
                                        productId = screen.productId,
                                        onNavigateBack = { navigateBack() },
                                        onNavigateToCart = { navigateTo(AppScreen.Cart) },
                                        onNavigateToWriteReview = { id -> navigateTo(AppScreen.WriteReview(id)) },
                                        onNavigateToLogin = { navigateTo(AppScreen.Login) },
                                        onNavigateToAddresses = { navigateTo(AppScreen.AddressManagement) },
                                        onNavigateHome = { navigateTo(AppScreen.Home) },
                                        onNavigateToCategory = { id -> navigateTo(AppScreen.CategoryDetail(id)) },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        snackbarHostState = snackbarHostState
                                    )
                                }
                                is AppScreen.AddressManagement -> {
                                    AddressManagementScreen(
                                        onNavigateBack = { navigateBack() }
                                    )
                                }
                                is AppScreen.WriteReview -> {
                                    WriteReviewScreen(
                                        productId = screen.productId,
                                        onNavigateBack = { navigateBack() },
                                        onReviewSubmitted = { navigateBack() },
                                        onGoHome = { navigateTo(AppScreen.Home) }
                                    )
                                }
                                is AppScreen.Settings -> {
                                    SettingsScreen(
                                        onNavigateBack = { navigateBack() }
                                    )
                                }
                                is AppScreen.SectionProducts -> {
                                    SectionProductsScreen(
                                        sectionId = screen.sectionId,
                                        onNavigateBack = { navigateBack() },
                                        onProductClick = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        onNavigateToLogin = { navigateTo(AppScreen.Login) },
                                        onNavigateToSearch = { navigateTo(AppScreen.Search) }
                                    )
                                }
                                is AppScreen.Contact -> {
                                    ContactScreen(
                                        onNavigateBack = { navigateBack() }
                                    )
                                }
                                is AppScreen.Wishlist -> {
                                    WishlistScreen(
                                        onNavigateToHome = { navigateTo(AppScreen.Home) },
                                        onNavigateToProduct = { id -> navigateTo(AppScreen.ProductDetail(id)) },
                                        snackbarHostState = snackbarHostState,
                                        onNavigateToLogin = { navigateTo(AppScreen.Login) }
                                    )
                                }
                                is AppScreen.Checkout -> {
                                    CheckoutScreen(
                                        onNavigateBack = { navigateBack() },
                                        onOrderPlaced = { orderId -> navigateTo(AppScreen.OrderSuccess(orderId)) }
                                    )
                                }
                                is AppScreen.OrderSuccess -> {
                                    OrderSuccessScreen(
                                        orderId = screen.orderId,
                                        onViewOrder = { orderId -> navigateTo(AppScreen.OrderDetail(orderId)) },
                                        onContinueShopping = { navigateTo(AppScreen.Home) },
                                        onViewOrders = { navigateTo(AppScreen.Orders) },
                                        onContactSupport = { currentScreen = AppScreen.Contact }
                                    )
                                }
                                is AppScreen.Orders -> {
                                    OrdersScreen(
                                        onNavigateBack = { currentScreen = AppScreen.Profile },
                                        onNavigateToOrderDetail = { id -> currentScreen = AppScreen.OrderDetail(id) },
                                        onNavigateToLogin = { currentScreen = AppScreen.Login }
                                    )
                                }
                                is AppScreen.OrderDetail -> {
                                    OrderDetailScreen(
                                        orderId = screen.orderId,
                                        onNavigateBack = { currentScreen = AppScreen.Orders },
                                        snackbarHostState = snackbarHostState
                                    )
                                }
                                is AppScreen.Login -> {
                                    LoginScreen(
                                        onNavigateBack = {
                                            pendingLoginDestination = null
                                            currentScreen = AppScreen.Home
                                        },
                                        onNavigateToSignup = {
                                            pendingLoginDestination = null
                                            currentScreen = AppScreen.Signup
                                        },
                                        onNavigateToForgotPassword = {
                                            pendingLoginDestination = null
                                            currentScreen = AppScreen.ForgotPassword
                                        },
                                        onLoginSuccess = {
                                            currentScreen = pendingLoginDestination ?: AppScreen.Home
                                            pendingLoginDestination = null
                                            loginSuccessMessage = null
                                        },
                                        initialSuccessMessage = loginSuccessMessage
                                    )
                                }
                                is AppScreen.Signup -> {
                                    SignupScreen(
                                        onNavigateBack = { currentScreen = AppScreen.Home },
                                        onNavigateToLogin = { currentScreen = AppScreen.Login },
                                        onNavigateToOtp = { email, name -> currentScreen = AppScreen.OTPVerification(email, name) }
                                    )
                                }
                                is AppScreen.OTPVerification -> {
                                    OTPVerificationScreen(
                                        email = screen.email,
                                        purpose = screen.purpose,
                                        onNavigateBack = {
                                            currentScreen = if (screen.purpose == "password-reset") AppScreen.ForgotPassword else AppScreen.Signup
                                        },
                                        onVerificationSuccess = { currentScreen = AppScreen.Home },
                                        onNavigateHome = { currentScreen = AppScreen.Home },
                                        onResetCodeEntered = { code -> currentScreen = AppScreen.NewPassword(screen.email, code) },
                                        onAlreadyConfirmed = { currentScreen = AppScreen.Login }
                                    )
                                }
                                is AppScreen.ForgotPassword -> {
                                    ForgotPasswordScreen(
                                        onNavigateBack = { currentScreen = AppScreen.Home },
                                        onNavigateToLogin = { currentScreen = AppScreen.Login },
                                        onNavigateToOtp = { email -> currentScreen = AppScreen.OTPVerification(email, purpose = "password-reset") }
                                    )
                                }
                                is AppScreen.NewPassword -> {
                                    NewPasswordScreen(
                                        email = screen.email,
                                        code = screen.code,
                                        onNavigateBack = { currentScreen = AppScreen.OTPVerification(screen.email, purpose = "password-reset") },
                                        onPasswordReset = {
                                            loginSuccessMessage = "Password reset successfully! Please login with your new password."
                                            currentScreen = AppScreen.Login
                                        },
                                        onNavigateHome = { currentScreen = AppScreen.Home }
                                    )
                                }
                                is AppScreen.Notifications -> {
                                    NotificationsScreen(
                                        onNavigateBack = { currentScreen = AppScreen.Home },
                                        onNavigateToOrder = { id -> currentScreen = AppScreen.OrderDetail(id) },
                                        onNavigateToLogin = { currentScreen = AppScreen.Login }
                                    )
                                }
                                is AppScreen.NotFound -> {
                                    NotFoundScreen(
                                        onGoHome = { currentScreen = AppScreen.Home },
                                        onGoBack = { currentScreen = AppScreen.Home }
                                    )
                                }
                                is AppScreen.Policy -> {
                                    PolicyScreen(
                                        policyType = screen.type,
                                        onNavigateBack = { currentScreen = AppScreen.Profile },
                                        onNavigateHome = { currentScreen = AppScreen.Home }
                                    )
                                }
                            }
                        }
                    }
                }
                if (!networkStatus.isOnline) {
                    Surface(modifier = Modifier.fillMaxSize(), color = Color(0xFF1E293B)) {
                        OfflineScreen(onRetry = networkStatus.refresh)
                    }
                }
                }
            }
        }
    }
}
