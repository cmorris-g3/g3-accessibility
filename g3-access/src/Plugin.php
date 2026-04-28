<?php

namespace G3\Access;

use G3\Access\Admin\AdminBar;
use G3\Access\Admin\ChecklistPage;
use G3\Access\Admin\PostEditMetabox;
use G3\Access\Admin\RemediationImagesPage;
use G3\Access\Admin\RemediationMenusPage;
use G3\Access\Admin\SettingsPage;
use G3\Access\Ajax\RemediationHandlers;
use G3\Access\Ajax\ScanHandlers;
use G3\Access\Cron\LicenseRefresh;

class Plugin
{
    public function boot(): void
    {
        Options::ensureDefaults();

        if (is_admin()) {
            (new SettingsPage())->register();
            (new ChecklistPage())->register();
            (new RemediationImagesPage())->register();
            (new RemediationMenusPage())->register();
            (new PostEditMetabox())->register();
            (new ScanHandlers())->register();
            (new RemediationHandlers())->register();
        }

        (new AdminBar())->register();
        (new LicenseRefresh())->register();
    }
}
