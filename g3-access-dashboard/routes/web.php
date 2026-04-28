<?php

use App\Http\Controllers\ReportController;
use App\Livewire\Adhoc\Index as AdhocIndex;
use App\Livewire\Findings\Index as FindingsIndex;
use App\Livewire\Overview;
use App\Livewire\Scans\Show as ScansShow;
use App\Livewire\Sites\Index as SitesIndex;
use App\Livewire\Sites\Mint as SitesMint;
use App\Livewire\Sites\Show as SitesShow;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome')->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', Overview::class)->name('dashboard');

    Route::get('sites', SitesIndex::class)->name('sites.index');
    Route::get('sites/new', SitesMint::class)->name('sites.mint');
    Route::get('sites/{license}', SitesShow::class)->name('sites.show');

    Route::get('findings', FindingsIndex::class)->name('findings.index');

    Route::get('scans/{scan}', ScansShow::class)->name('scans.show');
    Route::get('scans/{scan}/report.zip', [ReportController::class, 'download'])->name('scans.report');

    Route::get('adhoc', AdhocIndex::class)->name('adhoc.index');
});

require __DIR__.'/settings.php';
