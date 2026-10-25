<?php
/**
 * Plugin Name: Dcashop Uttamap
 * Description: Uttamap location picker and address search for the Dcashop WooCommerce checkout, including delivery location in order details.
 * Version: 1.0.0
 * Requires Plugins: woocommerce
 * Requires PHP: 7.4
 * Author: Seyyed Behzad Mousaviyan
 * Author URI: https://github.com/behzad79
 * Plugin URI: https://github.com/behzad79/dcashop-uttamap
 * Text Domain: dcashop-uttamap
 */

if (!defined('ABSPATH')) { exit; }

final class DCAShop_Uttamap_Map {
    const VER = '1.0.0';
    // Preserve the existing WordPress settings option so a directory rename never discards the saved API keys.
    const OPT = 'dcashop_uttamap_preview_options';
    const NONCE = 'dcashop_uttamap_checkout_v1';
    private static function settings(): array {
        $saved = get_option(self::OPT, array());
        return wp_parse_args(is_array($saved) ? $saved : array(), array('public_key'=>'','secret_key'=>'','enable_search'=>'1'));
    }
    public static function is_ready(): bool {
        $o=self::settings();
        return function_exists('WC') && class_exists('WooCommerce') &&
            is_string($o['public_key']) && (bool)preg_match('/^um_pk_[A-Za-z0-9_-]+$/D', $o['public_key']);
    }
    public static function boot(): void {
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_post_dcashop_uttamap_save', array(__CLASS__, 'save'));
        add_action('wp_enqueue_scripts', array(__CLASS__, 'enqueue_checkout'), 40);
        add_filter('woocommerce_checkout_fields', array(__CLASS__, 'ensure_coordinates_field'), 99998);
        add_action('wp_ajax_dcashop_uttamap_api', array(__CLASS__, 'api'));
        add_action('wp_ajax_nopriv_dcashop_uttamap_api', array(__CLASS__, 'api'));
        add_action('woocommerce_admin_order_data_after_shipping_address', array(__CLASS__, 'render_order_map'), 20, 1);
        add_action('admin_enqueue_scripts', array(__CLASS__, 'enqueue_admin_map'));
    }
    public static function menu(): void {
        add_submenu_page('woocommerce', 'نقشه یوتامپ Dcashop', 'نقشه یوتامپ Dcashop', 'manage_woocommerce', 'dcashop-uttamap', array(__CLASS__, 'settings_page'));
    }
    public static function save(): void {
        if (!current_user_can('manage_woocommerce')) { wp_die('دسترسی مجاز نیست.'); }
        check_admin_referer('dcashop_uttamap_save');
        $old=self::settings();
        $raw=isset($_POST['uttamap'])&&is_array($_POST['uttamap']) ? wp_unslash($_POST['uttamap']) : array();
        $public=isset($raw['public_key']) ? trim(sanitize_text_field($raw['public_key'])) : '';
        $secret=isset($raw['secret_key']) ? trim(sanitize_text_field($raw['secret_key'])) : '';
        $o=array(
            'public_key'=>!empty($raw['erase_public'])?'':($public!==''?$public:$old['public_key']),
            'secret_key'=>!empty($raw['erase_secret'])?'':($secret!==''?$secret:$old['secret_key']),
            'enable_search'=>!empty($raw['enable_search'])?'1':'0',
        );
        if ($o['public_key'] && !preg_match('/^um_pk_[A-Za-z0-9_-]+$/D',$o['public_key'])) {$status='bad_public';}
        elseif ($o['secret_key'] && !preg_match('/^um_sk_[A-Za-z0-9_-]+$/D',$o['secret_key'])) {$status='bad_secret';}
        else {update_option(self::OPT,$o,false);$status='saved';}
        wp_safe_redirect(add_query_arg(array('page'=>'dcashop-uttamap','status'=>$status),admin_url('admin.php')));exit;
    }
    public static function settings_page(): void {
        if (!current_user_can('manage_woocommerce')) {return;}
        $o=self::settings(); $status=isset($_GET['status'])?sanitize_key($_GET['status']):'';
        ?>
        <div class="wrap" dir="rtl" style="max-width:940px">
          <h1>نقشه یوتامپ Dcashop <small style="font-size:14px">نسخه <?php echo esc_html(self::VER); ?></small></h1>
          <?php if($status==='saved'): ?><div class="notice notice-success inline"><p>تنظیمات ذخیره شد.</p></div><?php endif; ?>
          <?php if($status==='bad_public'||$status==='bad_secret'): ?><div class="notice notice-error inline"><p>قالب کلید صحیح نیست: کلید عمومی با um_pk_ و کلید مخفی با um_sk_ شروع می‌شود.</p></div><?php endif; ?>
          <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="dcashop_uttamap_save"><?php wp_nonce_field('dcashop_uttamap_save'); ?>
            <table class="form-table"><tbody>
              <tr><th scope="row"><label for="dcutt_public">کلید عمومی وب (ضروری)</label></th><td>
                <input id="dcutt_public" name="uttamap[public_key]" type="text" value="<?php echo esc_attr($o['public_key']); ?>" class="regular-text" autocomplete="off" dir="ltr" style="width:100%;max-width:530px">
                <p class="description">کلید um_pk_ برای نقشه مرورگر و جستجو. فقط دامنه dcashop.ir را مجاز کن؛ پس از ذخیره در کادر باقی می‌ماند.</p>
                <label><input type="checkbox" name="uttamap[erase_public]" value="1"> پاک‌کردن این کلید</label>
              </td></tr>
              <tr><th scope="row"><label for="dcutt_secret">کلید مخفی سرور (اختیاری)</label></th><td>
                <input id="dcutt_secret" name="uttamap[secret_key]" type="password" value="<?php echo esc_attr($o['secret_key']); ?>" class="regular-text" dir="ltr" autocomplete="new-password" style="width:100%;max-width:530px">
                <button type="button" class="button" onclick="var e=document.getElementById('dcutt_secret');e.type=e.type==='password'?'text':'password'">نمایش / پنهان‌کردن</button>
                <p class="description">اختیاری؛ اگر استفاده شود فقط برای درخواست‌های سروری است و هرگز به مرورگر ارسال نمی‌شود. تنها کلید عمومی هم کافی است.</p>
                <label><input type="checkbox" name="uttamap[erase_secret]" value="1"> پاک‌کردن این کلید</label>
              </td></tr>
              <tr><th scope="row">جستجوی آدرس</th><td>
                <label><input type="checkbox" name="uttamap[enable_search]" value="1" <?php checked($o['enable_search'],'1'); ?>> فعال؛ با زدن جستجو یا Enter یک درخواست ارسال می‌شود</label>
              </td></tr>
            </tbody></table>
            <?php submit_button('ذخیره تنظیمات'); ?>
          </form>
        </div><?php
    }
    public static function ensure_coordinates_field($fields) {
        if (!isset($fields['billing'])) {return $fields;}
        if (!isset($fields['billing']['billing_map_lat_long'])) {
            $fields['billing']['billing_map_lat_long']=array('type'=>'hidden','required'=>false,'priority'=>190,'default'=>'');
        }
        return $fields;
    }
    public static function enqueue_checkout(): void {
        if (!self::is_ready() || !function_exists('is_checkout') || !is_checkout() || is_order_received_page() || is_wc_endpoint_url('order-pay')) {return;}
        $url=plugin_dir_url(__FILE__).'assets/';$o=self::settings();
        wp_enqueue_style('dcutt-maplibre','https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.css',array(),'5');
        wp_enqueue_script('dcutt-maplibre','https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js',array(),'5',true);
        wp_enqueue_style('dcutt-checkout',$url.'checkout-map.css',array('dcutt-maplibre'),self::VER);
        wp_enqueue_script('dcutt-checkout',$url.'checkout-map.js',array('dcutt-maplibre'),self::VER,true);
        wp_localize_script('dcutt-checkout','dcUttamapMap',array(
            'publicKey'=>$o['public_key'], 'hasSecret'=>!empty($o['secret_key']),
            'searchEnabled'=>$o['enable_search']==='1','ajaxUrl'=>admin_url('admin-ajax.php'),
            'nonce'=>wp_create_nonce(self::NONCE),
        ));
    }
    private static function rate_limit(string $op): void {
        // Short rate limit, not a daily quota. Hash visitor IP; never store raw IP.
        $ip=isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '';
        $key='dcutt_rl_'.md5(wp_salt('auth').'|'.$ip.'|'.$op);
        $count=(int)get_transient($key);
        if ($count>=20) {wp_send_json_error(array('message'=>'درخواست‌های نقشه زیاد شده است؛ یک دقیقه دیگر دوباره تلاش کنید.'),429);}
        set_transient($key,$count+1,MINUTE_IN_SECONDS);
    }
    private static function normalize_part($part): string {
        return trim((string)preg_replace('/\s+/u',' ',str_replace(array('ي','ك'),array('ی','ک'),sanitize_text_field((string)$part))));
    }
    // Only the provider's explicitly identified street belongs in billing_address_1.
    // Province and city still feed their separate WooCommerce checkout fields.
    private static function place(array $res, float $lat, float $lng): array {
        $components=isset($res['components'])&&is_array($res['components'])?$res['components']:array();
        $state=self::normalize_part($components['province']??$components['state']??'');
        $state=preg_replace('/^استان\s+/u','',$state);
        $city=self::normalize_part($components['city']??'');
        $street=self::normalize_part($components['street']??'');
        $candidate=array_values(array_filter(array_unique(array($city,
            self::normalize_part($components['town']??''),self::normalize_part($components['village']??'')))));
        return array('address'=>sanitize_textarea_field($street),
            'state'=>$state,'city'=>$city,'city_candidates'=>$candidate,
            'postcode'=>'','lat'=>$lat,'lng'=>$lng);
    }
    public static function api(): void {
        check_ajax_referer(self::NONCE,'nonce');
        if (!self::is_ready() || !function_exists('WC') || !WC()->cart || WC()->cart->is_empty()) {
            wp_send_json_error(array('message'=>'نقشه فقط در تسویه‌حساب فعال قابل استفاده است.'),403);
        }
        $o=self::settings();$key=$o['secret_key']?:$o['public_key'];
        $op=isset($_POST['operation'])?sanitize_key(wp_unslash($_POST['operation'])):'';
        if(!in_array($op,array('search','reverse'),true)){wp_send_json_error(array('message'=>'درخواست نامعتبر است.'),400);}
        if($op==='search' && $o['enable_search']!=='1'){wp_send_json_error(array('message'=>'جستجو غیرفعال است.'),400);}
        self::rate_limit($op);
        if($op==='search'){
            $term=isset($_POST['q'])?trim(sanitize_text_field(wp_unslash($_POST['q']))):'';
            $len=function_exists('mb_strlen')?mb_strlen($term):strlen($term);
            if($len<2||$len>250){wp_send_json_error(array('message'=>'عبارت جستجو باید ۲ تا ۲۵۰ نویسه باشد.'),400);}
            $args=array('q'=>$term,'limit'=>7);
            if(isset($_POST['near'])&&preg_match('/^\d+(?:\.\d+)?,\d+(?:\.\d+)?$/D',sanitize_text_field(wp_unslash($_POST['near'])))){
                $args['near']=sanitize_text_field(wp_unslash($_POST['near']));
            }
        }else{
            $lat=isset($_POST['lat'])?(float)$_POST['lat']:0;$lng=isset($_POST['lng'])?(float)$_POST['lng']:0;
            if($lat<24||$lat>41||$lng<43.5||$lng>64.8){wp_send_json_error(array('message'=>'این موقعیت خارج از محدوده ایران است.'),400);}
            $args=array('lat'=>$lat,'lng'=>$lng);
        }
        $url=add_query_arg($args,'https://api.uttamap.ir/v1/'.$op);
        $response=wp_remote_get($url,array('timeout'=>15,'redirection'=>0,'headers'=>array(
            'X-Api-Key'=>$key,'Accept'=>'application/json',
            'Origin'=>home_url(),'Referer'=>home_url('/'),
        )));
        if(is_wp_error($response)){wp_send_json_error(array('message'=>'ارتباط با سرویس نشانی برقرار نشد.'),502);}
        $code=(int)wp_remote_retrieve_response_code($response);
        $json=json_decode(wp_remote_retrieve_body($response),true);
        if($code<200||$code>=300){
            $msg=is_array($json)?($json['error']['message']??$json['message']??'') : '';
            wp_send_json_error(array('message'=>$msg?sanitize_text_field($msg):'سرویس نقشه پاسخ مناسبی نداد.','http'=>$code),$code>=400&&$code<=599?$code:502);
        }
        if(!is_array($json)){wp_send_json_error(array('message'=>'پاسخ نشانی معتبر نیست.'),502);}
        $items=isset($json['results'])&&is_array($json['results'])?$json['results']:array();
        if($op==='search'){
            $found=array();
            foreach(array_slice($items,0,10) as $r){
                if(!is_array($r)||!isset($r['location'])||!is_array($r['location'])){continue;}
                $y=(float)($r['location']['lat']??0);$x=(float)($r['location']['lng']??0);
                if($y<24||$y>41||$x<43.5||$x>64.8){continue;}
                $found[]=array('title'=>sanitize_text_field($r['label']??''),'address'=>sanitize_text_field(($r['components']['city']??'')),'lat'=>$y,'lng'=>$x);
            }
            wp_send_json_success(array('items'=>$found));
        }
        $row=isset($items[0])&&is_array($items[0])?$items[0]:array();
        if(!$row){wp_send_json_error(array('message'=>'برای این موقعیت نشانی پیدا نشد؛ لطفاً آدرس را دستی وارد کنید.'),404);}
        $place=self::place($row,$lat,$lng);
        wp_send_json_success($place);
    }
    private static function order_point($order): ?array {
        if(!($order instanceof WC_Order)){return null;}
        foreach(array('_dcashop_delivery_coordinates','_billing_map_lat_long','billing_map_lat_long') as $key){
            $v=$order->get_meta($key,true);
            if(!is_scalar($v)||!preg_match('/^\s*(\d{1,2}(?:\.\d+)?)\s*,\s*(\d{1,2}(?:\.\d+)?)\s*$/D',(string)$v,$m)){continue;}
            $lat=(float)$m[1];$lng=(float)$m[2];
            if($lat>=24&&$lat<=41&&$lng>=43.5&&$lng<=64.8){return array('lat'=>$lat,'lng'=>$lng);}
        }
        return null;
    }
    public static function render_order_map($order): void {
        if(!current_user_can('edit_shop_orders')&&!current_user_can('manage_woocommerce')){return;}
        $pos=self::order_point($order);if(!$pos){return;}
        $link='https://www.google.com/maps/search/?api=1&query='.rawurlencode($pos['lat'].','.$pos['lng']);
        echo '<div class="dcutt-order-map" dir="rtl"><details class="dcutt-order-details"><summary>📍 مشاهده موقعیت تحویل روی نقشه</summary>';
        echo '<div class="dcutt-order-content"><div class="dcutt-order-canvas" data-lat="'.esc_attr($pos['lat']).'" data-lng="'.esc_attr($pos['lng']).'"></div><p class="dcutt-order-fallback" hidden>نمایش نقشه ممکن نشد؛ از لینک مشاهده موقعیت استفاده کنید.</p>';
        echo '<p><a href="'.esc_url($link).'" rel="noopener noreferrer" target="_blank">بازکردن موقعیت در Google Maps ↗</a></p></div></details></div>';
    }
    public static function enqueue_admin_map(): void {
        if(!self::is_ready()||(!current_user_can('edit_shop_orders')&&!current_user_can('manage_woocommerce'))){return;}
        $screen=function_exists('get_current_screen')?get_current_screen():null;
        if(!$screen||!in_array($screen->id,array('shop_order','woocommerce_page_wc-orders'),true)){return;}
        $url=plugin_dir_url(__FILE__).'assets/';
        wp_enqueue_style('dcutt-maplibre','https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.css',array(),'5');
        wp_enqueue_script('dcutt-maplibre','https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js',array(),'5',true);
        wp_enqueue_style('dcutt-order-map',$url.'admin-order.css',array('dcutt-maplibre'),self::VER);
        wp_enqueue_script('dcutt-order-map',$url.'admin-order.js',array('dcutt-maplibre'),self::VER,true);
        wp_localize_script('dcutt-order-map','dcUttOrder',array('key'=>self::settings()['public_key']));
    }
}
add_action('plugins_loaded',array('DCAShop_Uttamap_Map','boot'),20);
